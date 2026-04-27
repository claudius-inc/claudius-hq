/**
 * One-shot script to apply schema fills + SLA tuning to the 7 existing
 * manifest offerings on V2.
 *
 * Defaults to dry-run (prints diff). To actually push:
 *   APPLY=1 npx tsx --env-file=.env.local scripts/apply-acp-sla-schemas.ts
 *
 * The 3 NEW manifest offerings (tx_simulate, abi_decode, url_reader) are
 * NOT created by this script — they require acp-cli `sell create` from the
 * seller VPS (or a manual POST to the V2 create endpoint). Run that
 * separately after reviewing this script's output.
 *
 * Reads / writes only the 7 keep-list entries via PUT /agents/{id}/offerings/{id}.
 */

import "dotenv/config";
import {
  getV2AgentInfo,
  updateV2Offering,
  type UpdateV2OfferingBody,
  type V2Offering,
} from "../src/lib/virtuals-client";
import { ACP_OFFERING_MANIFEST } from "../src/config/acp-offerings-manifest";

interface Plan {
  name: string;
  slaMinutes?: number;
  requirements?: Record<string, unknown>;
  deliverable?: Record<string, unknown> | string;
}

// Plans for the 7 EXISTING manifest entries. The NEW 3 need offering-create
// first; not handled here.
//
// NOTE: V2 enforces slaMinutes >= 5 as a hard floor (verified via 400
// response: "slaMinutes must not be less than 5"). The competitor-research
// framing of SLA as a sub-5-min discoverability lever was wrong; everyone
// at slaMinutes=5 is at the floor. Plans below leave SLA at 5 unchanged.
const PLANS: Plan[] = [
  {
    name: "live_price",
  },
  {
    name: "fear_greed",
    requirements: {
      type: "object",
      additionalProperties: false,
      properties: {
        lookback: {
          type: "integer",
          description: "Optional lookback window in days. Valid values: 7, 30, 365. Default 7.",
          enum: [7, 30, 365],
        },
      },
    },
    deliverable: {
      type: "object",
      properties: {
        value: { type: "integer", description: "Current FGI 0-100" },
        classification: {
          type: "string",
          enum: ["EXTREME_FEAR", "FEAR", "NEUTRAL", "GREED", "EXTREME_GREED"],
        },
        percentile1y: { type: "number", description: "Where the current value sits vs the last 365d" },
        momentum7d: { type: "integer", description: "Change vs 7d ago, in raw FGI points" },
        signal: {
          type: "string",
          enum: ["STRONG_BUY", "BUY", "NEUTRAL", "REDUCE", "STRONG_REDUCE"],
          description: "Actionable verdict: <20 STRONG_BUY, 20-40 BUY, 40-60 NEUTRAL, 60-80 REDUCE, >80 STRONG_REDUCE",
        },
        ts: { type: "string", format: "date-time" },
      },
      required: ["value", "classification", "signal", "ts"],
    },
  },
  {
    name: "funding_rate_signal",
    requirements: {
      type: "object",
      required: ["symbol"],
      additionalProperties: false,
      properties: {
        symbol: {
          type: "string",
          description: "Perpetual token symbol. Valid values: BTC, ETH, SOL, HYPE, BNB, XRP, DOGE, etc.",
        },
        venue: {
          type: "string",
          enum: ["binance", "bybit", "aggregate"],
          description: "Optional venue filter. Default: aggregate (cross-venue mean).",
        },
      },
    },
    deliverable: {
      type: "object",
      properties: {
        symbol: { type: "string" },
        venue: { type: "string" },
        rate8h: { type: "number", description: "Current 8h funding rate as decimal (e.g. 0.0001 = 0.01%)" },
        annualized: { type: "number", description: "Annualized rate as decimal (rate8h * 3 * 365)" },
        signal: {
          type: "string",
          enum: ["LONG_CROWDED", "SHORT_CROWDED", "BALANCED", "CARRY_OPPORTUNITY"],
        },
        squeezeRisk: { type: "integer", description: "0-100; >70 = imminent liquidation risk one-side" },
        ts: { type: "string", format: "date-time" },
      },
      required: ["symbol", "rate8h", "annualized", "signal", "ts"],
    },
  },
  {
    name: "token_safety_quick",
  },
  {
    name: "portfolio_risk_metrics",
    requirements: {
      type: "object",
      required: ["holdings"],
      additionalProperties: false,
      properties: {
        holdings: {
          type: "array",
          minItems: 1,
          maxItems: 50,
          description: "Portfolio holdings with weights summing to 1.0 (or unweighted to use equal-weight default).",
          items: {
            type: "object",
            required: ["ticker"],
            properties: {
              ticker: {
                type: "string",
                description: "Asset ticker. Crypto (BTC, ETH, SOL, ...) or equity (AAPL, NVDA, ...).",
              },
              weight: {
                type: "number",
                minimum: 0,
                maximum: 1,
                description: "Optional portfolio weight 0..1. If omitted across holdings, equal-weighted is assumed.",
              },
            },
          },
        },
        period: {
          type: "integer",
          minimum: 30,
          maximum: 730,
          description: "Optional lookback in days. Default 365.",
        },
      },
    },
    deliverable: {
      type: "object",
      properties: {
        asOf: { type: "string", format: "date-time" },
        weighted: {
          type: "object",
          description: "Portfolio-level metrics weighted across holdings",
          properties: {
            beta: { type: "number", description: "vs SPY (or BTC for crypto-only)" },
            volatilityPct: { type: "number", description: "Annualized stdev of returns, %" },
            var95Pct: { type: "number", description: "1-day Value-at-Risk @95% confidence, %" },
            var99Pct: { type: "number" },
            sharpeRatio: { type: "number" },
            maxDrawdownPct: { type: "number" },
          },
        },
        perHolding: {
          type: "array",
          items: {
            type: "object",
            properties: {
              ticker: { type: "string" },
              weight: { type: "number" },
              beta: { type: "number" },
              volPct: { type: "number" },
              contribution: { type: "number", description: "Contribution to portfolio volatility, %" },
            },
          },
        },
      },
      required: ["asOf", "weighted"],
    },
  },
  {
    name: "token_alpha_report",
    requirements: {
      type: "object",
      required: ["token"],
      additionalProperties: false,
      properties: {
        token: {
          type: "string",
          description: "Token symbol to analyze. Valid: BTC, ETH, SOL, PEPE, VIRTUAL, AIXBT, FET, LLAMA, plus 500+ others.",
        },
        timeframe: {
          type: "string",
          enum: ["4h", "1d", "1w"],
          description: "Analysis timeframe. Default 1d.",
        },
      },
    },
    deliverable: {
      type: "object",
      properties: {
        token: { type: "string" },
        asOf: { type: "string", format: "date-time" },
        timeframe: { type: "string", enum: ["4h", "1d", "1w"] },
        signal: {
          type: "string",
          enum: ["STRONG_BUY", "BUY", "NEUTRAL", "SELL", "STRONG_SELL"],
        },
        confidence: { type: "integer", description: "0-100" },
        levels: {
          type: "object",
          properties: {
            support: { type: "array", items: { type: "number" }, description: "S1, S2, S3" },
            resistance: { type: "array", items: { type: "number" }, description: "R1, R2, R3" },
          },
        },
        indicators: {
          type: "object",
          properties: {
            rsi: { type: "number" },
            macdSignal: { type: "string", enum: ["BULL", "BEAR", "NEUTRAL"] },
            trend: { type: "string", enum: ["UP", "DOWN", "SIDEWAYS"] },
          },
        },
        btcCorr30d: { type: "number" },
        ethCorr30d: { type: "number" },
        narrative: { type: "string", description: "Short prose summary of the setup" },
      },
      required: ["token", "asOf", "signal", "confidence"],
    },
  },
  {
    name: "tx_simulate",
    deliverable: {
      type: "object",
      properties: {
        chainId: { type: "integer" },
        chainName: { type: "string" },
        success: { type: "boolean", description: "true = simulation succeeded; false = revert" },
        revertReason: { type: ["string", "null"], description: "Decoded Error(string) reason on revert" },
        returnValue: { type: ["string", "null"], description: "Hex-encoded return data from eth_call" },
        gasUsed: { type: "string", description: "Estimated gas used (decimal string)" },
        gasLimit: { type: "string", description: "Recommended gas limit = gasUsed * 1.20" },
        events: {
          type: "array",
          description: "Decoded events from Alchemy trace. Empty if Alchemy not used or tx emits no events.",
          items: {
            type: "object",
            properties: {
              contract: { type: "string" },
              name: { type: "string" },
              signature: { type: "string" },
              args: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    name: { type: "string" },
                    type: { type: "string" },
                    value: {},
                  },
                },
              },
            },
          },
        },
        eventsAvailable: { type: "boolean", description: "true when Alchemy trace ran; false = verdict-only" },
        notes: { type: "string" },
        durationMs: { type: "integer" },
      },
      required: ["success", "gasUsed", "gasLimit", "eventsAvailable"],
    },
  },
  {
    name: "abi_decode",
    deliverable: {
      type: "object",
      properties: {
        chainId: { type: "integer" },
        chainName: { type: "string" },
        function: {
          type: ["object", "null"],
          description: "Decoded calldata, or null if no data was supplied / not decodable.",
          properties: {
            name: { type: "string" },
            signature: { type: "string", description: "Canonical sighash, e.g. 'transfer(address,uint256)'" },
            args: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  type: { type: "string" },
                  value: {},
                },
              },
            },
          },
        },
        events: {
          type: "array",
          description: "One entry per decoded event log",
          items: {
            type: "object",
            properties: {
              contract: { type: "string" },
              name: { type: "string" },
              signature: { type: "string" },
              args: { type: "array" },
            },
          },
        },
        unknown: {
          type: "object",
          properties: {
            selectors: { type: "array", items: { type: "string" }, description: "4-byte selectors that 4byte+verifiedABI couldn't resolve" },
            topics: { type: "array", items: { type: "string" }, description: "Event topics that couldn't be resolved" },
          },
        },
        tx: {
          type: ["object", "null"],
          description: "Tx metadata (only when txHash mode was used)",
          properties: {
            blockNumber: { type: "integer" },
            from: { type: "string" },
            to: { type: ["string", "null"] },
            value: { type: "string" },
            gasUsed: { type: "string" },
            status: { type: "integer" },
          },
        },
        durationMs: { type: "integer" },
      },
      required: ["chainId", "events", "unknown"],
    },
  },
  {
    name: "url_reader",
    deliverable: {
      type: "object",
      properties: {
        url: { type: "string" },
        finalUrl: { type: "string", description: "URL after redirects" },
        title: { type: ["string", "null"] },
        byline: { type: ["string", "null"], description: "Author / byline if Readability extracted one" },
        publishedAt: { type: ["string", "null"], description: "ISO 8601 if a date meta tag was found" },
        lang: { type: ["string", "null"] },
        ogImage: { type: ["string", "null"] },
        excerpt: { type: ["string", "null"] },
        wasReadable: {
          type: "boolean",
          description: "true if @mozilla/readability extracted a meaningful article; false = full body fallback",
        },
        format: { type: "string", enum: ["markdown", "text", "json"] },
        markdown: { type: "string" },
        text: { type: "string" },
        wordCount: { type: "integer" },
        links: {
          type: "array",
          items: {
            type: "object",
            properties: {
              href: { type: "string" },
              text: { type: "string" },
            },
          },
        },
        fetchedAt: { type: "string", format: "date-time" },
        durationMs: { type: "integer" },
      },
      required: ["url", "finalUrl", "wasReadable", "format", "wordCount", "fetchedAt"],
    },
  },
  {
    name: "dex_arbitrage",
    requirements: {
      type: "object",
      additionalProperties: false,
      properties: {
        token: {
          type: "string",
          description: "Optional token filter (BTC, ETH, SOL, etc). Omit to scan all monitored pairs.",
        },
        minSpread: {
          type: "number",
          minimum: 0,
          maximum: 50,
          description: "Minimum spread % to include in results. Default 0.5.",
        },
      },
    },
    deliverable: {
      type: "object",
      properties: {
        chain: { type: "string", description: "Currently 'base' only" },
        scannedAt: { type: "string", format: "date-time" },
        scanned: { type: "integer", description: "Number of token pairs scanned" },
        opportunities: {
          type: "array",
          items: {
            type: "object",
            properties: {
              token: { type: "string" },
              fromDex: { type: "string" },
              toDex: { type: "string" },
              spreadPct: { type: "number" },
              sizeUSD: { type: "number", description: "Recommended trade size, USD" },
              gasUSD: { type: "number" },
              netUSD: { type: "number", description: "Expected profit after gas" },
              ts: { type: "string", format: "date-time" },
            },
          },
        },
      },
      required: ["chain", "scannedAt", "opportunities"],
    },
  },
];

interface Diff {
  name: string;
  changes: Array<{ field: string; from: unknown; to: unknown }>;
  body: UpdateV2OfferingBody;
  liveId: string;
}

function diffOffering(plan: Plan, live: V2Offering): Diff | null {
  const changes: Diff["changes"] = [];
  const body: UpdateV2OfferingBody = {};

  if (plan.slaMinutes !== undefined && plan.slaMinutes !== live.slaMinutes) {
    changes.push({ field: "slaMinutes", from: live.slaMinutes, to: plan.slaMinutes });
    body.slaMinutes = plan.slaMinutes;
  }
  if (plan.requirements !== undefined) {
    const liveStr = JSON.stringify(live.requirements ?? {});
    const planStr = JSON.stringify(plan.requirements);
    if (liveStr !== planStr) {
      changes.push({ field: "requirements", from: live.requirements, to: plan.requirements });
      body.requirements = plan.requirements;
    }
  }
  if (plan.deliverable !== undefined) {
    const liveStr = typeof live.deliverable === "string" ? live.deliverable : JSON.stringify(live.deliverable ?? {});
    const planStr = typeof plan.deliverable === "string" ? plan.deliverable : JSON.stringify(plan.deliverable);
    if (liveStr !== planStr) {
      changes.push({ field: "deliverable", from: live.deliverable, to: plan.deliverable });
      body.deliverable = plan.deliverable;
    }
  }

  if (changes.length === 0) return null;
  return { name: plan.name, changes, body, liveId: live.id };
}

async function main() {
  const apply = process.env.APPLY === "1";
  console.log(`\n=== ACP schema/SLA ${apply ? "APPLY" : "DRY-RUN"} ===`);
  console.log(
    `Manifest: ${ACP_OFFERING_MANIFEST.length} offerings; this script touches the 7 already live on V2.\n`
  );

  const agent = await getV2AgentInfo();
  const liveByName = new Map(agent.offerings.map((o) => [o.name, o]));

  const diffs: Diff[] = [];
  for (const plan of PLANS) {
    const live = liveByName.get(plan.name);
    if (!live) {
      console.log(`SKIP ${plan.name}: not found on V2 (needs offering-create first)`);
      continue;
    }
    const diff = diffOffering(plan, live);
    if (!diff) {
      console.log(`OK   ${plan.name}: already matches plan`);
      continue;
    }
    diffs.push(diff);
    console.log(`\nDIFF ${plan.name} (id=${diff.liveId}):`);
    for (const c of diff.changes) {
      const fromStr = typeof c.from === "string" ? c.from : JSON.stringify(c.from);
      const toStr = typeof c.to === "string" ? c.to : JSON.stringify(c.to);
      console.log(`  ${c.field}:`);
      console.log(`    -  ${fromStr.slice(0, 200)}${fromStr.length > 200 ? "..." : ""}`);
      console.log(`    +  ${toStr.slice(0, 200)}${toStr.length > 200 ? "..." : ""}`);
    }
  }

  console.log(`\nTotal offerings to update: ${diffs.length}`);
  if (!apply) {
    console.log("\n(dry-run; set APPLY=1 to actually PUT)");
    return;
  }
  if (diffs.length === 0) {
    console.log("Nothing to apply.");
    return;
  }

  console.log("\nApplying...");
  for (const d of diffs) {
    try {
      await updateV2Offering(d.liveId, d.body);
      console.log(`  ✅ ${d.name}`);
    } catch (err) {
      console.log(`  ❌ ${d.name}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  console.log("\nDone.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
