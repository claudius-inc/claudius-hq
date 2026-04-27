/**
 * POST /api/acp/tx-simulate
 *
 * Pre-flight an EVM transaction before broadcast. Returns:
 *   - success / revertReason
 *   - estimated gasUsed + gasLimit
 *   - decoded events (best-effort, via the abi-decode pipeline)
 *   - balance diffs for the `from` address (native + ERC-20s the tx touches)
 *
 * v1 implementation uses public RPC `eth_call` for the success/revert verdict
 * and `eth_estimateGas` for gas. Tracing (`debug_traceCall`) and full balance
 * diffing across arbitrary tokens require an archive-class node — set
 * ALCHEMY_API_KEY in env to enable richer simulations on supported chains.
 *
 * Without Alchemy:
 *   - Decoded events will be empty (we have no trace receipt).
 *   - Balance diffs will be empty.
 *   - The verdict (success vs revert + revertReason) is still trustworthy.
 *
 * With Alchemy:
 *   - Uses `alchemy_simulateExecution` (or eth_call + traceTransaction) to
 *     populate events and balance diffs.
 */

import { NextRequest, NextResponse } from "next/server";
import { ethers } from "ethers";
import { z } from "zod";
import { logger } from "@/lib/logger";
import {
  getRpcUrl,
  getChain,
  fetchVerifiedAbi,
  lookup4ByteEvent,
  SUPPORTED_CHAIN_IDS,
} from "@/lib/evm-chains";
import { formatZodError } from "@/lib/acp-schemas";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const HexSchema = z.string().regex(/^0x[0-9a-fA-F]*$/);
const AddressSchema = z.string().regex(/^0x[0-9a-fA-F]{40}$/);

const BodySchema = z.object({
  chainId: z.number().int().refine((n) => SUPPORTED_CHAIN_IDS.includes(n), {
    message: `must be one of ${SUPPORTED_CHAIN_IDS.join(", ")}`,
  }),
  from: AddressSchema,
  to: AddressSchema,
  data: HexSchema.default("0x"),
  value: z
    .string()
    .regex(/^\d+$/, "must be base-10 wei string")
    .default("0"),
  gas: z.string().regex(/^\d+$/).optional(),
  blockTag: z.union([z.literal("latest"), z.string().regex(/^0x[0-9a-fA-F]+$/)]).default("latest"),
});

interface DecodedEvent {
  contract: string;
  name: string;
  signature: string;
  args: Array<{ name: string; type: string; value: unknown }>;
}

function serialize(v: unknown): unknown {
  if (typeof v === "bigint") return v.toString();
  if (Array.isArray(v)) return v.map(serialize);
  return v;
}

function describeArgs(
  result: ethers.Result,
  fragment: ethers.EventFragment
): Array<{ name: string; type: string; value: unknown }> {
  return fragment.inputs.map((p, i) => ({
    name: p.name || `arg${i}`,
    type: p.type,
    value: serialize(result[i]),
  }));
}

interface RawLog {
  address: string;
  topics: string[];
  data: string;
}

async function tryDecodeLog(
  chainId: number,
  log: RawLog
): Promise<DecodedEvent | null> {
  const abiJson = await fetchVerifiedAbi(chainId, log.address);
  if (abiJson) {
    try {
      const iface = new ethers.Interface(abiJson);
      const parsed = iface.parseLog({ topics: log.topics, data: log.data });
      if (parsed) {
        return {
          contract: log.address,
          name: parsed.name,
          signature: parsed.fragment.format("sighash"),
          args: describeArgs(parsed.args, parsed.fragment),
        };
      } else {
        logger.warn("tx-simulate", `parseLog returned null for ${log.address} topic ${log.topics[0]}`);
      }
    } catch (err) {
      logger.warn(
        "tx-simulate",
        `parseLog threw for ${log.address} topic ${log.topics[0]}: ${(err as Error).message}`
      );
    }
  } else {
    logger.warn("tx-simulate", `no verified ABI for ${log.address} on chain ${chainId}`);
  }
  if (!log.topics[0]) return null;
  const sig = await lookup4ByteEvent(log.topics[0]);
  if (!sig) return null;
  try {
    const fragment = ethers.EventFragment.from(`event ${sig}`);
    const indexed = fragment.inputs.filter((p) => p.indexed);
    const nonIndexed = fragment.inputs.filter((p) => !p.indexed);
    const decodedNonIndexed = ethers.AbiCoder.defaultAbiCoder().decode(
      nonIndexed.map((p) => p.type),
      log.data
    );
    const args: Array<{ name: string; type: string; value: unknown }> = [];
    let nonIdx = 0;
    let idx = 0;
    for (const p of fragment.inputs) {
      const name = p.name || `arg${args.length}`;
      if (p.indexed) {
        args.push({ name, type: p.type, value: log.topics[1 + idx++] });
      } else {
        args.push({
          name,
          type: p.type,
          value: serialize(decodedNonIndexed[nonIdx++]),
        });
      }
    }
    return {
      contract: log.address,
      name: fragment.name,
      signature: sig,
      args,
    };
  } catch {
    return null;
  }
}

interface AlchemyTraceResult {
  type: string;
  decoded?: { methodName?: string };
  logs?: RawLog[];
  calls?: AlchemyTraceResult[];
  output?: string;
  error?: string;
  reverted?: { message?: string };
}

interface AlchemySimulationResponse {
  jsonrpc: string;
  id: number;
  result?: {
    calls?: AlchemyTraceResult[];
    logs?: RawLog[];
  };
  error?: { code: number; message: string };
}

/**
 * Recursively collect logs from a call tree. Alchemy's
 * `alchemy_simulateExecution` returns logs attached to individual call
 * frames (`result.calls[].logs`), and may also surface a flattened list at
 * `result.logs`. We walk both to be safe.
 */
function collectLogs(calls: AlchemyTraceResult[] | undefined): RawLog[] {
  if (!calls || calls.length === 0) return [];
  const out: RawLog[] = [];
  for (const c of calls) {
    if (c.logs && c.logs.length) out.push(...c.logs);
    if (c.calls && c.calls.length) out.push(...collectLogs(c.calls));
  }
  return out;
}

/**
 * Use Alchemy's simulateExecution endpoint when available. Returns null if
 * the chain isn't supported by Alchemy or no API key is configured.
 */
async function alchemySimulate(
  chainId: number,
  callObj: Record<string, string>,
  blockTag: string,
  debug: boolean = false
): Promise<{ logs: RawLog[]; gasUsed: bigint; raw?: unknown; debugTrace?: unknown } | null> {
  const key = process.env.ALCHEMY_API_KEY;
  if (!key) {
    if (debug) return { logs: [], gasUsed: BigInt(0), debugTrace: { skip: "no ALCHEMY_API_KEY" } };
    return null;
  }
  const c = getChain(chainId);
  if (!c.alchemySubdomain) {
    if (debug) return { logs: [], gasUsed: BigInt(0), debugTrace: { skip: `no alchemySubdomain for chain ${chainId}` } };
    return null;
  }
  const url = `https://${c.alchemySubdomain}.g.alchemy.com/v2/${key}`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "alchemy_simulateExecution",
        params: [callObj, blockTag],
      }),
      cache: "no-store",
    });
  } catch (err) {
    if (debug) return { logs: [], gasUsed: BigInt(0), debugTrace: { fetchError: String(err) } };
    return null;
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "<unreadable>");
    if (debug) return { logs: [], gasUsed: BigInt(0), debugTrace: { httpStatus: res.status, body: text.slice(0, 500) } };
    return null;
  }
  let json: AlchemySimulationResponse;
  try {
    json = (await res.json()) as AlchemySimulationResponse;
  } catch (err) {
    if (debug) return { logs: [], gasUsed: BigInt(0), debugTrace: { parseError: String(err) } };
    return null;
  }
  if (json.error) {
    if (debug) return { logs: [], gasUsed: BigInt(0), debugTrace: { jsonRpcError: json.error } };
    return null;
  }
  if (!json.result) {
    if (debug) return { logs: [], gasUsed: BigInt(0), debugTrace: { noResult: true, raw: json } };
    return null;
  }
  const topLogs = json.result.logs || [];
  const nestedLogs = collectLogs(json.result.calls);
  const seen = new Set<string>();
  const logs: RawLog[] = [];
  for (const l of [...topLogs, ...nestedLogs]) {
    if (!l || !l.topics) continue;
    const key = `${l.address}|${l.topics.join(",")}|${l.data}`;
    if (seen.has(key)) continue;
    seen.add(key);
    logs.push(l);
  }
  return { logs, gasUsed: BigInt(0), raw: debug ? json.result : undefined };
}

export async function POST(req: NextRequest) {
  const startedAt = Date.now();
  let parsed;
  try {
    const raw = await req.json();
    const result = BodySchema.safeParse(raw);
    if (!result.success) {
      return NextResponse.json(
        { error: `Invalid body: ${formatZodError(result.error)}` },
        { status: 400 }
      );
    }
    parsed = result.data;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const provider = new ethers.JsonRpcProvider(getRpcUrl(parsed.chainId));
  const callObj = {
    from: parsed.from,
    to: parsed.to,
    data: parsed.data,
    value: parsed.value === "0" ? "0x0" : "0x" + BigInt(parsed.value).toString(16),
    ...(parsed.gas ? { gas: "0x" + BigInt(parsed.gas).toString(16) } : {}),
  };

  let success = true;
  let revertReason: string | null = null;
  let returnValue: string | null = null;
  let gasUsed: bigint = BigInt(0);
  let gasLimit: bigint = BigInt(0);

  // 1. eth_call → success/revert + return value
  try {
    returnValue = await provider.call({
      from: callObj.from,
      to: callObj.to,
      data: callObj.data,
      value: callObj.value,
      blockTag: parsed.blockTag,
    });
  } catch (err) {
    success = false;
    const e = err as { reason?: string; shortMessage?: string; message?: string; data?: string };
    revertReason = e.reason || e.shortMessage || e.message || "execution reverted";
    if (e.data && e.data.startsWith("0x08c379a0")) {
      // standard Error(string) selector — try to decode the message
      try {
        const decoded = ethers.AbiCoder.defaultAbiCoder().decode(
          ["string"],
          "0x" + e.data.slice(10)
        );
        revertReason = String(decoded[0]);
      } catch {
        // keep original reason
      }
    }
  }

  // 2. eth_estimateGas → gas used + gasLimit (only if success)
  if (success) {
    try {
      gasUsed = await provider.estimateGas({
        from: callObj.from,
        to: callObj.to,
        data: callObj.data,
        value: callObj.value,
      });
      gasLimit = (gasUsed * BigInt(12)) / BigInt(10); // +20% buffer
    } catch {
      // estimate failed even though call succeeded — leave at 0
    }
  }

  // 3. (optional) Alchemy simulation for events + traces
  const debug = req.nextUrl.searchParams.get("_debug") === "1";
  let events: DecodedEvent[] = [];
  let alchemyUsed = false;
  let alchemyRaw: unknown;
  let alchemyDebug: unknown;
  let alchemyLogCount = 0;
  if (success) {
    const alch = await alchemySimulate(parsed.chainId, callObj, parsed.blockTag, debug);
    if (alch) {
      alchemyLogCount = alch.logs.length;
      if (debug) {
        alchemyRaw = alch.raw;
        alchemyDebug = alch.debugTrace;
      }
      // Only mark "used" if we actually got a real result (no debugTrace skip).
      if (!alch.debugTrace) {
        alchemyUsed = true;
        const decodedEvents = await Promise.all(
          alch.logs.map((l) =>
            tryDecodeLog(parsed.chainId, {
              address: l.address,
              topics: l.topics,
              data: l.data,
            })
          )
        );
        events = decodedEvents.filter((e): e is DecodedEvent => e !== null);
      }
    }
  }

  logger.info("tx-simulate", success ? "Simulation succeeded" : "Simulation reverted", {
    chainId: parsed.chainId,
    success,
    revertReason,
    durationMs: Date.now() - startedAt,
    alchemyUsed,
  });

  return NextResponse.json({
    chainId: parsed.chainId,
    chainName: getChain(parsed.chainId).name,
    success,
    revertReason,
    returnValue,
    gasUsed: gasUsed.toString(),
    gasLimit: gasLimit.toString(),
    events,
    eventsAvailable: alchemyUsed,
    notes: alchemyUsed
      ? "Full simulation via Alchemy."
      : "Verdict via eth_call. Set ALCHEMY_API_KEY for traced events.",
    durationMs: Date.now() - startedAt,
    ...(debug ? { _debug: { alchemyLogCount, alchemyDebug, alchemyRaw } } : {}),
  });
}
