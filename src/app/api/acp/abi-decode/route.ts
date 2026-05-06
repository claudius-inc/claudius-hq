/**
 * POST /api/acp/abi-decode
 *
 * Decodes EVM calldata and event logs into named function args + event fields.
 * Two input modes:
 *   1. Whole transaction:   { chainId, txHash }
 *      → fetches tx + receipt from RPC, decodes input + every log
 *   2. Targeted decode:     { chainId, contract, data?, log? }
 *      → decodes the calldata or single log against the contract's verified ABI
 *
 * Resolution path: verified ABI (Etherscan v2) → 4byte directory fallback for
 * unknowns → if both miss, the selector or topic is returned in `unknown[]`.
 *
 * Output schema is deterministic so executor / scout agents can chain it
 * without LLM normalization.
 */

import { NextRequest, NextResponse } from "next/server";
import { ethers } from "ethers";
import { z } from "zod";
import { logger } from "@/lib/logger";
import {
  getRpcUrl,
  getChain,
  fetchVerifiedAbi,
  lookup4ByteSelector,
  lookup4ByteEvent,
  SUPPORTED_CHAIN_IDS,
} from "@/lib/acp/evm-chains";
import { formatZodError } from "@/lib/acp/acp-schemas";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const HexSchema = z.string().regex(/^0x[0-9a-fA-F]*$/);
const AddressSchema = z.string().regex(/^0x[0-9a-fA-F]{40}$/);
const ChainIdSchema = z.number().int().refine((n) => SUPPORTED_CHAIN_IDS.includes(n), {
  message: `must be one of ${SUPPORTED_CHAIN_IDS.join(", ")}`,
});

const BodySchema = z
  .object({
    chainId: ChainIdSchema,
    txHash: z
      .string()
      .regex(/^0x[0-9a-fA-F]{64}$/)
      .optional(),
    contract: AddressSchema.optional(),
    data: HexSchema.optional(),
    log: z
      .object({
        address: AddressSchema,
        topics: z.array(z.string().regex(/^0x[0-9a-fA-F]{64}$/)).min(1).max(4),
        data: HexSchema,
      })
      .optional(),
  })
  .refine(
    (b) => Boolean(b.txHash) || Boolean(b.contract && (b.data || b.log)),
    { message: "must provide either txHash, or { contract + (data | log) }" }
  );

interface DecodedFn {
  name: string;
  signature: string;
  args: Array<{ name: string; type: string; value: unknown }>;
}

interface DecodedEvent {
  contract: string;
  name: string;
  signature: string;
  args: Array<{ name: string; type: string; value: unknown }>;
}

const abiCache = new Map<string, ethers.Interface | null>();

async function loadInterface(
  chainId: number,
  contract: string
): Promise<ethers.Interface | null> {
  const k = `${chainId}:${contract.toLowerCase()}`;
  if (abiCache.has(k)) return abiCache.get(k) ?? null;
  const abiJson = await fetchVerifiedAbi(chainId, contract);
  let iface: ethers.Interface | null = null;
  if (abiJson) {
    try {
      iface = new ethers.Interface(abiJson);
    } catch (err) {
      logger.warn("abi-decode", `Bad ABI from Etherscan for ${contract}: ${(err as Error).message}`);
    }
  }
  abiCache.set(k, iface);
  return iface;
}

function describeArgs(
  result: ethers.Result,
  fragment: ethers.FunctionFragment | ethers.EventFragment
): Array<{ name: string; type: string; value: unknown }> {
  return fragment.inputs.map((p, i) => ({
    name: p.name || `arg${i}`,
    type: p.type,
    value: serialize(result[i]),
  }));
}

function serialize(v: unknown): unknown {
  if (typeof v === "bigint") return v.toString();
  if (Array.isArray(v)) return v.map(serialize);
  if (v && typeof v === "object" && (v as { toJSON?: () => unknown }).toJSON) {
    return (v as { toJSON: () => unknown }).toJSON();
  }
  return v;
}

async function decodeCalldata(
  chainId: number,
  contract: string,
  data: string
): Promise<{ fn: DecodedFn | null; unknownSelector: string | null }> {
  if (data.length < 10) return { fn: null, unknownSelector: null };
  const selector = data.slice(0, 10).toLowerCase();
  const iface = await loadInterface(chainId, contract);
  if (iface) {
    try {
      const parsed = iface.parseTransaction({ data });
      if (parsed) {
        return {
          fn: {
            name: parsed.name,
            signature: parsed.fragment.format("sighash"),
            args: describeArgs(parsed.args, parsed.fragment),
          },
          unknownSelector: null,
        };
      }
    } catch {
      // fall through to 4byte
    }
  }
  const sig = await lookup4ByteSelector(selector);
  if (sig) {
    try {
      const fragment = ethers.FunctionFragment.from(`function ${sig}`);
      const decoded = ethers.AbiCoder.defaultAbiCoder().decode(
        fragment.inputs,
        "0x" + data.slice(10)
      );
      return {
        fn: {
          name: fragment.name,
          signature: sig,
          args: describeArgs(decoded, fragment),
        },
        unknownSelector: null,
      };
    } catch {
      return { fn: null, unknownSelector: selector };
    }
  }
  return { fn: null, unknownSelector: selector };
}

async function decodeOneLog(
  chainId: number,
  log: { address: string; topics: string[]; data: string }
): Promise<{ event: DecodedEvent | null; unknownTopic: string | null }> {
  const iface = await loadInterface(chainId, log.address);
  if (iface) {
    try {
      const parsed = iface.parseLog({ topics: log.topics, data: log.data });
      if (parsed) {
        return {
          event: {
            contract: log.address,
            name: parsed.name,
            signature: parsed.fragment.format("sighash"),
            args: describeArgs(parsed.args, parsed.fragment),
          },
          unknownTopic: null,
        };
      }
    } catch {
      // fall through to 4byte
    }
  }
  const sig = await lookup4ByteEvent(log.topics[0]);
  if (sig) {
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
        event: {
          contract: log.address,
          name: fragment.name,
          signature: sig,
          args,
        },
        unknownTopic: null,
      };
    } catch {
      return { event: null, unknownTopic: log.topics[0] };
    }
  }
  return { event: null, unknownTopic: log.topics[0] };
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

  try {
    getChain(parsed.chainId);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }

  const unknownSelectors: string[] = [];
  const unknownTopics: string[] = [];
  let fn: DecodedFn | null = null;
  const events: DecodedEvent[] = [];
  let txMeta: Record<string, unknown> | null = null;

  try {
    if (parsed.txHash) {
      const provider = new ethers.JsonRpcProvider(getRpcUrl(parsed.chainId));
      const [tx, receipt] = await Promise.all([
        provider.getTransaction(parsed.txHash),
        provider.getTransactionReceipt(parsed.txHash),
      ]);
      if (!tx || !receipt) {
        return NextResponse.json(
          { error: `Transaction ${parsed.txHash} not found on chain ${parsed.chainId}` },
          { status: 404 }
        );
      }
      txMeta = {
        blockNumber: receipt.blockNumber,
        from: tx.from,
        to: tx.to,
        value: tx.value.toString(),
        gasUsed: receipt.gasUsed.toString(),
        status: receipt.status,
      };
      if (tx.to && tx.data && tx.data !== "0x") {
        const r = await decodeCalldata(parsed.chainId, tx.to, tx.data);
        fn = r.fn;
        if (r.unknownSelector) unknownSelectors.push(r.unknownSelector);
      }
      for (const log of receipt.logs) {
        const r = await decodeOneLog(parsed.chainId, {
          address: log.address,
          topics: [...log.topics],
          data: log.data,
        });
        if (r.event) events.push(r.event);
        else if (r.unknownTopic) unknownTopics.push(r.unknownTopic);
      }
    } else if (parsed.contract) {
      if (parsed.data) {
        const r = await decodeCalldata(parsed.chainId, parsed.contract, parsed.data);
        fn = r.fn;
        if (r.unknownSelector) unknownSelectors.push(r.unknownSelector);
      }
      if (parsed.log) {
        const r = await decodeOneLog(parsed.chainId, parsed.log);
        if (r.event) events.push(r.event);
        else if (r.unknownTopic) unknownTopics.push(r.unknownTopic);
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error("abi-decode", msg, { chainId: parsed.chainId });
    return NextResponse.json({ error: msg }, { status: 502 });
  }

  return NextResponse.json({
    chainId: parsed.chainId,
    chainName: getChain(parsed.chainId).name,
    function: fn,
    events,
    unknown: {
      selectors: Array.from(new Set(unknownSelectors)),
      topics: Array.from(new Set(unknownTopics)),
    },
    tx: txMeta,
    durationMs: Date.now() - startedAt,
  });
}
