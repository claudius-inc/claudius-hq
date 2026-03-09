import type { PlaybookEvent, PlaybookDataSnapshot, TriggerCondition } from "./types";
import {
  indicatorValue,
  etfRangePosition,
  sectorRelStrength,
  sectorScore,
  spreadValue,
} from "./engine";

// ── Helper to build trigger conditions concisely ──

function trigger(
  id: string,
  label: string,
  evaluate: (s: PlaybookDataSnapshot) => { firing: boolean; value: string; detail: string },
): TriggerCondition {
  return {
    id,
    label,
    evaluate: (s) => ({ id, label, ...evaluate(s) }),
  };
}

// ═══════════════════════════════════════════════════
// 1. RECESSION ONSET
// ═══════════════════════════════════════════════════
const recessionOnset: PlaybookEvent = {
  id: "recession-onset",
  name: "Recession Onset",
  category: "economic-cycle",
  description:
    "Yield curve un-inverts, credit spreads widen, defensives outperform cyclicals. Classic late-cycle deterioration.",
  historicalContext:
    "The 2s10s curve un-inverting after sustained inversion preceded every recession since 1970. The signal isn't the inversion itself — it's the steepening that follows.",
  implications: [
    "Rotate to defensives (XLU, XLP, healthcare)",
    "Reduce exposure to cyclicals (XLY, XLI)",
    "Increase duration — TLT benefits from rate cuts",
    "Watch for credit spread blowouts",
  ],
  triggers: [
    trigger("yield-curve", "Yield curve steepening / un-inverting", (s) => {
      const spread = spreadValue(s, "2s10s Spread");
      if (spread === null) return { firing: false, value: "N/A", detail: "No data" };
      // Firing if curve is flat or positively sloped after having been inverted
      return {
        firing: spread > -0.2 && spread < 0.8,
        value: `${spread.toFixed(2)}%`,
        detail: spread > 0 ? "Curve positive — un-inversion signal" : "Curve near flat",
      };
    }),
    trigger("credit-spreads", "Credit spreads widening", (s) => {
      const hy = indicatorValue(s, "hy-spread");
      if (hy === null) return { firing: false, value: "N/A", detail: "No data" };
      return {
        firing: hy > 400,
        value: `${hy.toFixed(0)} bps`,
        detail: hy > 500 ? "Distress levels" : hy > 400 ? "Elevated" : "Normal",
      };
    }),
    trigger("jobless-claims", "Initial claims rising", (s) => {
      const claims = indicatorValue(s, "initial-claims");
      if (claims === null) return { firing: false, value: "N/A", detail: "No data" };
      return {
        firing: claims > 280,
        value: `${(claims / 1000).toFixed(0)}K`,
        detail: claims > 300 ? "Recession territory" : "Trending up",
      };
    }),
    trigger("defensives-outperform", "Defensives outperforming cyclicals", (s) => {
      const xlu = sectorRelStrength(s, "utilities");
      const xlp = sectorRelStrength(s, "consumer_defensive");
      const xly = sectorRelStrength(s, "consumer_cyclical");
      if (xlu === null || xlp === null || xly === null)
        return { firing: false, value: "N/A", detail: "No data" };
      const defensiveAvg = (xlu + xlp) / 2;
      const diff = defensiveAvg - xly;
      return {
        firing: diff > 2,
        value: `${diff > 0 ? "+" : ""}${diff.toFixed(1)}%`,
        detail: `Defensives vs cyclicals relative strength`,
      };
    }),
    trigger("tlt-rallying", "TLT rallying (flight to safety)", (s) => {
      const pos = etfRangePosition(s, "TLT");
      if (pos === null) return { firing: false, value: "N/A", detail: "No data" };
      return {
        firing: pos > 65,
        value: `${pos}% of 52w range`,
        detail: pos > 80 ? "Strong bond rally" : "Upper range",
      };
    }),
    trigger("oil-weakening", "Oil weakening (demand destruction)", (s) => {
      const oil = s.oil?.wti?.price;
      if (oil === null || oil === undefined) return { firing: false, value: "N/A", detail: "No data" };
      return {
        firing: oil < 55,
        value: `$${oil.toFixed(2)}`,
        detail: oil < 45 ? "Recessionary collapse" : "Demand weakness",
      };
    }),
  ],
};

// ═══════════════════════════════════════════════════
// 2. STAGFLATION
// ═══════════════════════════════════════════════════
const stagflation: PlaybookEvent = {
  id: "stagflation",
  name: "Stagflation",
  category: "economic-cycle",
  description:
    "Inflation stays elevated while growth stalls. The worst macro environment — no good hiding spots except commodities.",
  historicalContext:
    "1970s stagflation saw stocks lose 50%+ in real terms. Energy and gold were the only winners. Modern version: supply-chain driven inflation + rate hikes slowing growth.",
  implications: [
    "Commodity producers (XLE, XLB) outperform",
    "Gold as inflation hedge",
    "Avoid long-duration bonds (TLT falls)",
    "Avoid growth/tech (rate-sensitive)",
  ],
  triggers: [
    trigger("cpi-elevated", "CPI elevated (>4%)", (s) => {
      const cpi = indicatorValue(s, "cpi");
      if (cpi === null) return { firing: false, value: "N/A", detail: "No data" };
      return { firing: cpi > 4, value: `${cpi.toFixed(1)}%`, detail: cpi > 6 ? "Hot inflation" : "Above target" };
    }),
    trigger("pce-elevated", "PCE elevated (>3%)", (s) => {
      const pce = indicatorValue(s, "pce");
      if (pce === null) return { firing: false, value: "N/A", detail: "No data" };
      return { firing: pce > 3, value: `${pce.toFixed(1)}%`, detail: pce > 4 ? "Hot" : "Above target" };
    }),
    trigger("growth-slowing", "Industrial production declining", (s) => {
      const ip = indicatorValue(s, "industrial-production");
      if (ip === null) return { firing: false, value: "N/A", detail: "No data" };
      return { firing: ip < 0, value: `${ip.toFixed(1)}%`, detail: "Contraction" };
    }),
    trigger("energy-strong", "Energy sector outperforming", (s) => {
      const rs = sectorRelStrength(s, "energy");
      if (rs === null) return { firing: false, value: "N/A", detail: "No data" };
      return { firing: rs > 2, value: `${rs > 0 ? "+" : ""}${rs.toFixed(1)}%`, detail: "vs SPY" };
    }),
    trigger("tlt-weak", "TLT falling (bonds selling off)", (s) => {
      const pos = etfRangePosition(s, "TLT");
      if (pos === null) return { firing: false, value: "N/A", detail: "No data" };
      return { firing: pos < 35, value: `${pos}% of 52w range`, detail: "Yields rising" };
    }),
    trigger("tech-lagging", "XLK underperforming", (s) => {
      const rs = sectorRelStrength(s, "technology");
      if (rs === null) return { firing: false, value: "N/A", detail: "No data" };
      return { firing: rs < -2, value: `${rs.toFixed(1)}%`, detail: "vs SPY" };
    }),
  ],
};

// ═══════════════════════════════════════════════════
// 3. RECOVERY / REFLATION
// ═══════════════════════════════════════════════════
const recoveryReflation: PlaybookEvent = {
  id: "recovery-reflation",
  name: "Recovery / Reflation",
  category: "economic-cycle",
  description:
    "Yield curve steepening, spreads tightening, cyclicals outperforming defensives. Early expansion dynamics.",
  historicalContext:
    "Post-GFC recovery (2009-2011) and post-COVID recovery (mid-2020) saw massive cyclical outperformance. XLI, XLY, and small caps led.",
  implications: [
    "Overweight cyclicals (XLY, XLI, XLF)",
    "Commodities benefit from demand recovery",
    "Reduce defensives and duration",
    "Breadth should be improving",
  ],
  triggers: [
    trigger("curve-steepening", "Yield curve steepening", (s) => {
      const spread = spreadValue(s, "2s10s Spread");
      if (spread === null) return { firing: false, value: "N/A", detail: "No data" };
      return { firing: spread > 0.5, value: `${spread.toFixed(2)}%`, detail: "Positive slope" };
    }),
    trigger("spreads-tightening", "Credit spreads tightening", (s) => {
      const hy = indicatorValue(s, "hy-spread");
      if (hy === null) return { firing: false, value: "N/A", detail: "No data" };
      return { firing: hy < 350, value: `${hy.toFixed(0)} bps`, detail: "Healthy" };
    }),
    trigger("cyclicals-leading", "Cyclicals outperforming defensives", (s) => {
      const xly = sectorRelStrength(s, "consumer_cyclical");
      const xli = sectorRelStrength(s, "industrials");
      const xlu = sectorRelStrength(s, "utilities");
      if (xly === null || xli === null || xlu === null)
        return { firing: false, value: "N/A", detail: "No data" };
      const cyclicalAvg = (xly + xli) / 2;
      const diff = cyclicalAvg - xlu;
      return { firing: diff > 1.5, value: `${diff > 0 ? "+" : ""}${diff.toFixed(1)}%`, detail: "Cyclicals vs defensives" };
    }),
    trigger("oil-strengthening", "Oil/commodities rising", (s) => {
      const oil = s.oil?.wti?.changePercent;
      if (oil === null || oil === undefined) return { firing: false, value: "N/A", detail: "No data" };
      return { firing: oil > 3, value: `${oil > 0 ? "+" : ""}${oil.toFixed(1)}%`, detail: "Demand recovery" };
    }),
    trigger("breadth-improving", "Market breadth improving", (s) => {
      if (!s.breadth) return { firing: false, value: "N/A", detail: "No data" };
      const nh = s.breadth.newHighsLows.netHighs;
      return {
        firing: s.breadth.level === "bullish" || (nh !== null && nh > 50),
        value: s.breadth.level,
        detail: nh !== null ? `Net new highs: ${nh}` : "",
      };
    }),
  ],
};

// ═══════════════════════════════════════════════════
// 4. DEFLATIONARY BUST
// ═══════════════════════════════════════════════════
const deflationaryBust: PlaybookEvent = {
  id: "deflationary-bust",
  name: "Deflationary Bust",
  category: "economic-cycle",
  description:
    "Prices falling, demand collapsing, bonds rallying as deflation fears dominate.",
  historicalContext:
    "Japan 1990s, GFC 2008-2009, COVID March 2020. Deflation is rare but devastating.",
  implications: [
    "TLT and long duration massively outperform",
    "Cash is valuable — prices falling",
    "Cyclicals get crushed",
    "Fed will cut aggressively",
  ],
  triggers: [
    trigger("cpi-falling", "CPI below 2%", (s) => {
      const cpi = indicatorValue(s, "cpi");
      if (cpi === null) return { firing: false, value: "N/A", detail: "No data" };
      return { firing: cpi < 1.5, value: `${cpi.toFixed(1)}%`, detail: "Deflation risk" };
    }),
    trigger("oil-collapsing", "Oil collapsing", (s) => {
      const oil = s.oil?.wti?.price;
      if (oil === null || oil === undefined) return { firing: false, value: "N/A", detail: "No data" };
      return { firing: oil < 50, value: `$${oil.toFixed(2)}`, detail: "Demand collapse" };
    }),
    trigger("tlt-surging", "TLT surging", (s) => {
      const pos = etfRangePosition(s, "TLT");
      if (pos === null) return { firing: false, value: "N/A", detail: "No data" };
      return { firing: pos > 80, value: `${pos}% of 52w range`, detail: "Flight to duration" };
    }),
    trigger("cyclicals-crushed", "Cyclicals collapsing", (s) => {
      const xly = sectorRelStrength(s, "consumer_cyclical");
      const xli = sectorRelStrength(s, "industrials");
      if (xly === null || xli === null) return { firing: false, value: "N/A", detail: "No data" };
      const avg = (xly + xli) / 2;
      return { firing: avg < -5, value: `${avg.toFixed(1)}%`, detail: "vs SPY" };
    }),
  ],
};

// ═══════════════════════════════════════════════════
// 5. TIGHTENING CYCLE STRESS
// ═══════════════════════════════════════════════════
const tighteningStress: PlaybookEvent = {
  id: "tightening-stress",
  name: "Tightening Cycle Stress",
  category: "monetary",
  description:
    "Fed funds elevated, bonds selling off, rate-sensitive sectors under pressure. Policy overtightening risk.",
  historicalContext:
    "2022-2023 tightening cycle: fastest rate hikes in decades broke SVB, stressed regional banks, and crushed XLRE. TLT fell 50% from peak.",
  implications: [
    "Avoid rate-sensitive sectors (XLRE, XLU)",
    "Credit risk rising — watch HY spreads",
    "Cash and short-duration become attractive",
    "VIX likely to remain elevated",
  ],
  triggers: [
    trigger("fed-funds-high", "Fed funds rate elevated", (s) => {
      const ff = indicatorValue(s, "fed-funds");
      if (ff === null) return { firing: false, value: "N/A", detail: "No data" };
      return { firing: ff > 4, value: `${ff.toFixed(2)}%`, detail: ff > 5 ? "Very restrictive" : "Restrictive" };
    }),
    trigger("tlt-falling", "TLT falling", (s) => {
      const pos = etfRangePosition(s, "TLT");
      if (pos === null) return { firing: false, value: "N/A", detail: "No data" };
      return { firing: pos < 30, value: `${pos}% of 52w range`, detail: "Lower range — yields high" };
    }),
    trigger("xlre-weak", "Real estate sector weak", (s) => {
      const rs = sectorRelStrength(s, "real_estate");
      if (rs === null) return { firing: false, value: "N/A", detail: "No data" };
      return { firing: rs < -2, value: `${rs.toFixed(1)}%`, detail: "vs SPY" };
    }),
    trigger("credit-widening", "Credit spreads widening", (s) => {
      const hy = indicatorValue(s, "hy-spread");
      if (hy === null) return { firing: false, value: "N/A", detail: "No data" };
      return { firing: hy > 400, value: `${hy.toFixed(0)} bps`, detail: hy > 500 ? "Stress" : "Elevated" };
    }),
    trigger("vix-elevated", "VIX elevated", (s) => {
      const vix = s.sentiment?.vix.value;
      if (vix === null || vix === undefined) return { firing: false, value: "N/A", detail: "No data" };
      return { firing: vix > 22, value: vix.toFixed(1), detail: vix > 30 ? "Fear" : "Elevated" };
    }),
  ],
};

// ═══════════════════════════════════════════════════
// 5. EASING CYCLE BEGINS
// ═══════════════════════════════════════════════════
const easingCycle: PlaybookEvent = {
  id: "easing-cycle",
  name: "Easing Cycle Begins",
  category: "monetary",
  description:
    "Fed pivoting to cuts. Bonds rally, rate-sensitive assets recover, gold strengthens on real yield compression.",
  historicalContext:
    "First rate cut often marks market bottom (2019 pivot). However, if cuts come due to recession, equities may continue falling despite lower rates.",
  implications: [
    "Duration play — TLT rallies on rate cuts",
    "Gold benefits from falling real yields",
    "XLRE and XLU recover",
    "Watch if cutting into weakness vs strength",
  ],
  triggers: [
    trigger("fed-funds-dropping", "Fed funds rate below cycle peak", (s) => {
      const ff = indicatorValue(s, "fed-funds");
      if (ff === null) return { firing: false, value: "N/A", detail: "No data" };
      // Firing if below recent restrictive levels but still elevated
      return { firing: ff < 5 && ff > 2, value: `${ff.toFixed(2)}%`, detail: "Below peak" };
    }),
    trigger("tlt-rallying", "TLT rallying", (s) => {
      const pos = etfRangePosition(s, "TLT");
      if (pos === null) return { firing: false, value: "N/A", detail: "No data" };
      return { firing: pos > 60, value: `${pos}% of 52w range`, detail: "Bond strength" };
    }),
    trigger("curve-steepening", "Yield curve steepening", (s) => {
      const spread = spreadValue(s, "2s10s Spread");
      if (spread === null) return { firing: false, value: "N/A", detail: "No data" };
      return { firing: spread > 0, value: `${spread.toFixed(2)}%`, detail: "Positive slope" };
    }),
    trigger("gold-strengthening", "Gold strengthening", (s) => {
      const gold = s.gold?.livePrice;
      const ath = s.gold?.analysis?.ath;
      if (gold === null || gold === undefined) return { firing: false, value: "N/A", detail: "No data" };
      const nearAth = ath ? gold / ath > 0.92 : false;
      return { firing: nearAth, value: `$${gold.toFixed(0)}`, detail: nearAth ? "Near ATH" : "Rising" };
    }),
  ],
};

// ═══════════════════════════════════════════════════
// 6. LIQUIDITY CRISIS
// ═══════════════════════════════════════════════════
const liquidityCrisis: PlaybookEvent = {
  id: "liquidity-crisis",
  name: "Liquidity Crisis",
  category: "monetary",
  description:
    "Severe market stress. VIX spikes, credit freezes, breadth washes out, volatility term structure inverts.",
  historicalContext:
    "March 2020 COVID crash, 2008 GFC, 1998 LTCM — all featured VIX >40, credit spreads blowing out, and correlation-1 selling.",
  implications: [
    "Cash is king — preserve capital",
    "Expect Fed emergency intervention",
    "Don't catch falling knives early",
    "Watch for policy response as buy signal",
  ],
  triggers: [
    trigger("vix-spike", "VIX >30", (s) => {
      const vix = s.sentiment?.vix.value;
      if (vix === null || vix === undefined) return { firing: false, value: "N/A", detail: "No data" };
      return { firing: vix > 30, value: vix.toFixed(1), detail: vix > 40 ? "Panic" : "Fear" };
    }),
    trigger("credit-blowout", "Credit spreads blow out", (s) => {
      const hy = indicatorValue(s, "hy-spread");
      if (hy === null) return { firing: false, value: "N/A", detail: "No data" };
      return { firing: hy > 600, value: `${hy.toFixed(0)} bps`, detail: "Crisis levels" };
    }),
    trigger("breadth-washout", "Breadth washout", (s) => {
      if (!s.breadth) return { firing: false, value: "N/A", detail: "No data" };
      const ratio = s.breadth.advanceDecline.ratio;
      return {
        firing: s.breadth.level === "bearish" && ratio !== null && ratio < 0.5,
        value: ratio !== null ? ratio.toFixed(2) : "N/A",
        detail: "Extreme selling",
      };
    }),
    trigger("vol-backwardation", "Vol term structure in backwardation", (s) => {
      const ts = s.sentiment?.volatilityContext?.termStructure;
      if (ts === null || ts === undefined) return { firing: false, value: "N/A", detail: "No data" };
      return { firing: ts < 1, value: ts.toFixed(2), detail: ts < 0.9 ? "Inverted" : "Flat" };
    }),
    trigger("financials-stress", "Financial sector under pressure", (s) => {
      const rs = sectorRelStrength(s, "financials");
      if (rs === null) return { firing: false, value: "N/A", detail: "No data" };
      return { firing: rs < -5, value: `${rs.toFixed(1)}%`, detail: "vs SPY — severe" };
    }),
  ],
};

// ═══════════════════════════════════════════════════
// 7. ENERGY / COMMODITY SHOCK
// ═══════════════════════════════════════════════════
const energyShock: PlaybookEvent = {
  id: "energy-shock",
  name: "Energy / Commodity Shock",
  category: "geopolitical",
  description:
    "Energy sector surging, oil breaking higher, gold bid, DXY weakening. Supply disruption or geopolitical premium building.",
  historicalContext:
    "2022 Russia-Ukraine: oil spiked to $130, XLE surged 60%+, DXY strengthened initially then weakened. 1973 oil embargo. 1990 Gulf War.",
  implications: [
    "Overweight energy producers (XLE)",
    "Inflation expectations rise — short duration",
    "Consumer spending pressured — bearish XLY",
    "Defense sector (ITA) may benefit",
  ],
  triggers: [
    trigger("xle-surging", "XLE relative strength surging", (s) => {
      const rs = sectorRelStrength(s, "energy");
      if (rs === null) return { firing: false, value: "N/A", detail: "No data" };
      return { firing: rs > 3, value: `${rs > 0 ? "+" : ""}${rs.toFixed(1)}%`, detail: "vs SPY" };
    }),
    trigger("oil-breakout", "Oil breaking higher", (s) => {
      const oil = s.oil?.wti?.price;
      if (oil === null || oil === undefined) return { firing: false, value: "N/A", detail: "No data" };
      return { firing: oil > 85, value: `$${oil.toFixed(2)}`, detail: oil > 100 ? "Spike" : "Elevated" };
    }),
    trigger("gold-bid", "Gold bid (safe haven)", (s) => {
      const gold = s.gold?.livePrice;
      const ath = s.gold?.analysis?.ath;
      if (gold === null || gold === undefined) return { firing: false, value: "N/A", detail: "No data" };
      const nearAth = ath ? gold / ath > 0.9 : false;
      return { firing: nearAth, value: `$${gold.toFixed(0)}`, detail: "Near ATH — safe haven demand" };
    }),
    trigger("dxy-weak", "DXY weakening", (s) => {
      const dxy = s.gold?.dxy?.price;
      if (dxy === null || dxy === undefined) return { firing: false, value: "N/A", detail: "No data" };
      return { firing: dxy < 100, value: dxy.toFixed(1), detail: dxy < 95 ? "Weak dollar" : "Below 100" };
    }),
    trigger("ita-strong", "ITA (Defense) strengthening", (s) => {
      const pos = etfRangePosition(s, "ITA");
      if (pos === null) return { firing: false, value: "N/A", detail: "No data" };
      return { firing: pos > 65, value: `${pos}% of 52w range`, detail: "Defense premium" };
    }),
  ],
};

// ═══════════════════════════════════════════════════
// 8. TRADE WAR / DEGLOBALIZATION
// ═══════════════════════════════════════════════════
const tradeWar: PlaybookEvent = {
  id: "trade-war",
  name: "Trade War / Deglobalization",
  category: "geopolitical",
  description:
    "EM underperforming, DXY strengthening, industrial production declining. Tariff and supply chain disruption dynamics.",
  historicalContext:
    "2018-2019 US-China trade war: China/EM ETFs fell 20%+, DXY strengthened, industrials lagged, ag commodities volatile.",
  implications: [
    "Underweight EM and China exposure",
    "DXY strength continues",
    "Industrials face margin pressure",
    "Reshoring beneficiaries may outperform",
  ],
  triggers: [
    trigger("dxy-strong", "DXY strengthening", (s) => {
      const dxy = s.gold?.dxy?.price;
      if (dxy === null || dxy === undefined) return { firing: false, value: "N/A", detail: "No data" };
      return { firing: dxy > 105, value: dxy.toFixed(1), detail: dxy > 110 ? "Very strong" : "Elevated" };
    }),
    trigger("industrials-weak", "XLI underperforming", (s) => {
      const rs = sectorRelStrength(s, "industrials");
      if (rs === null) return { firing: false, value: "N/A", detail: "No data" };
      return { firing: rs < -2, value: `${rs.toFixed(1)}%`, detail: "vs SPY" };
    }),
    trigger("ip-declining", "Industrial production declining", (s) => {
      const ip = indicatorValue(s, "industrial-production");
      if (ip === null) return { firing: false, value: "N/A", detail: "No data" };
      return { firing: ip < 0, value: `${ip.toFixed(1)}%`, detail: "Contraction" };
    }),
    trigger("materials-weak", "Materials sector weak", (s) => {
      const rs = sectorRelStrength(s, "materials");
      if (rs === null) return { firing: false, value: "N/A", detail: "No data" };
      return { firing: rs < -2, value: `${rs.toFixed(1)}%`, detail: "vs SPY" };
    }),
  ],
};

// ═══════════════════════════════════════════════════
// 9. WAR / MILITARY ESCALATION
// ═══════════════════════════════════════════════════
const warEscalation: PlaybookEvent = {
  id: "war-escalation",
  name: "War / Military Escalation",
  category: "geopolitical",
  description:
    "ITA surging, oil spiking, gold spiking, VIX rising, bonds bid. Classic geopolitical risk-off with defense premium.",
  historicalContext:
    "Gulf War, 9/11, Russia-Ukraine — ITA and defense stocks outperform, oil spikes on supply fears, gold and bonds as safe havens.",
  implications: [
    "Defense sector (ITA) outperforms",
    "Oil spikes — inflationary impulse",
    "Gold and bonds as safe havens",
    "Avoid airlines, tourism, EM exposure",
  ],
  triggers: [
    trigger("ita-surging", "ITA (Defense ETF) surging", (s) => {
      const pos = etfRangePosition(s, "ITA");
      if (pos === null) return { firing: false, value: "N/A", detail: "No data" };
      return { firing: pos > 75, value: `${pos}% of 52w range`, detail: "Defense premium" };
    }),
    trigger("oil-spiking", "Oil spiking", (s) => {
      const oil = s.oil?.wti?.price;
      if (oil === null || oil === undefined) return { firing: false, value: "N/A", detail: "No data" };
      return { firing: oil > 90, value: `$${oil.toFixed(2)}`, detail: "Supply disruption premium" };
    }),
    trigger("gold-spiking", "Gold spiking", (s) => {
      const gold = s.gold?.livePrice;
      const ath = s.gold?.analysis?.ath;
      if (gold === null || gold === undefined) return { firing: false, value: "N/A", detail: "No data" };
      const nearAth = ath ? gold / ath > 0.95 : gold > 2200;
      return { firing: nearAth, value: `$${gold.toFixed(0)}`, detail: "Safe haven bid" };
    }),
    trigger("vix-rising", "VIX rising", (s) => {
      const vix = s.sentiment?.vix.value;
      if (vix === null || vix === undefined) return { firing: false, value: "N/A", detail: "No data" };
      return { firing: vix > 22, value: vix.toFixed(1), detail: "Fear rising" };
    }),
    trigger("tlt-bid", "Bonds bid (flight to safety)", (s) => {
      const pos = etfRangePosition(s, "TLT");
      if (pos === null) return { firing: false, value: "N/A", detail: "No data" };
      return { firing: pos > 60, value: `${pos}% of 52w range`, detail: "Safe haven" };
    }),
  ],
};

// ═══════════════════════════════════════════════════
// 10. INSURANCE CASCADE / CHOKEPOINT CLOSURE
// ═══════════════════════════════════════════════════
const insuranceCascade: PlaybookEvent = {
  id: "insurance-cascade",
  name: "Insurance Cascade / Chokepoint Closure",
  category: "geopolitical",
  description:
    "Maritime insurance withdrawals close critical chokepoints. Reinsurers pull capacity under Solvency II constraints, P&I clubs cancel war-risk coverage, commercial transit collapses regardless of military situation.",
  historicalContext:
    "2026 Hormuz: Seven P&I clubs withdrew coverage, closing Strait despite US naval dominance. 2023-25 Red Sea: Houthi attacks caused 26-month rerouting. 1987-88 Tanker War. Insurance, not navies, is the gating variable.",
  implications: [
    "Oil stays elevated far longer than consensus expects",
    "Tanker/shipping companies print money (VLCC rates spike)",
    "Energy importers crushed (Korea, Japan, Europe)",
    "Duration mismatch: markets price weeks, reality is months",
  ],
  triggers: [
    trigger("oil-spike", "Oil >$100 (crisis level)", (s) => {
      const oil = s.oil?.wti?.price;
      if (oil === null || oil === undefined) return { firing: false, value: "N/A", detail: "No data" };
      return { firing: oil > 100, value: `$${oil.toFixed(2)}`, detail: oil > 120 ? "Extreme" : "Crisis level" };
    }),
    trigger("energy-surge", "Energy sector massively outperforming", (s) => {
      const rs = sectorRelStrength(s, "energy");
      if (rs === null) return { firing: false, value: "N/A", detail: "No data" };
      return { firing: rs > 5, value: `${rs > 0 ? "+" : ""}${rs.toFixed(1)}%`, detail: "vs SPY — supply shock premium" };
    }),
    trigger("vix-elevated", "VIX elevated (>25)", (s) => {
      const vix = s.sentiment?.vix.value;
      if (vix === null || vix === undefined) return { firing: false, value: "N/A", detail: "No data" };
      return { firing: vix > 25, value: vix.toFixed(1), detail: vix > 35 ? "Panic" : "Elevated fear" };
    }),
    trigger("gold-safe-haven", "Gold bid (safe haven)", (s) => {
      const gold = s.gold?.livePrice;
      const ath = s.gold?.analysis?.ath;
      if (gold === null || gold === undefined) return { firing: false, value: "N/A", detail: "No data" };
      const nearAth = ath ? gold / ath > 0.92 : false;
      return { firing: nearAth, value: `$${gold.toFixed(0)}`, detail: "Safe haven demand" };
    }),
    trigger("consumer-crushed", "Consumer discretionary crushed", (s) => {
      const rs = sectorRelStrength(s, "consumer_cyclical");
      if (rs === null) return { firing: false, value: "N/A", detail: "No data" };
      return { firing: rs < -3, value: `${rs.toFixed(1)}%`, detail: "Energy costs crushing demand" };
    }),
  ],
  activeThreshold: 0.6,
  warmingThreshold: 0.4,
};

// ═══════════════════════════════════════════════════
// 11. CREDIT CRISIS
// ═══════════════════════════════════════════════════
const creditCrisis: PlaybookEvent = {
  id: "credit-crisis",
  name: "Credit Crisis",
  category: "financial-system",
  description:
    "HY spreads blow out, financials collapse, VIX spikes, TLT rallies as flight-to-quality dominates.",
  historicalContext:
    "2008 GFC: HY spreads hit 2000bps, XLF fell 80%, VIX hit 80. 2020 March: HY spreads hit 1100bps briefly. SVB 2023: regional bank crisis.",
  implications: [
    "Avoid financials and HY credit",
    "Quality/duration play — TLT rallies hard",
    "Cash and treasuries only",
    "Watch for Fed backstop as inflection",
  ],
  triggers: [
    trigger("hy-blowout", "HY spread >500bps", (s) => {
      const hy = indicatorValue(s, "hy-spread");
      if (hy === null) return { firing: false, value: "N/A", detail: "No data" };
      return { firing: hy > 500, value: `${hy.toFixed(0)} bps`, detail: hy > 800 ? "Crisis" : "Distress" };
    }),
    trigger("ig-widening", "IG spread widening", (s) => {
      const ig = indicatorValue(s, "ig-spread");
      if (ig === null) return { firing: false, value: "N/A", detail: "No data" };
      return { firing: ig > 150, value: `${ig.toFixed(0)} bps`, detail: "Elevated" };
    }),
    trigger("xlf-collapsing", "XLF collapsing", (s) => {
      const rs = sectorRelStrength(s, "financials");
      if (rs === null) return { firing: false, value: "N/A", detail: "No data" };
      return { firing: rs < -5, value: `${rs.toFixed(1)}%`, detail: "vs SPY — severe" };
    }),
    trigger("vix-spiking", "VIX spiking >35", (s) => {
      const vix = s.sentiment?.vix.value;
      if (vix === null || vix === undefined) return { firing: false, value: "N/A", detail: "No data" };
      return { firing: vix > 35, value: vix.toFixed(1), detail: "Panic" };
    }),
    trigger("tlt-rallying", "TLT rallying (flight to quality)", (s) => {
      const pos = etfRangePosition(s, "TLT");
      if (pos === null) return { firing: false, value: "N/A", detail: "No data" };
      return { firing: pos > 70, value: `${pos}% of 52w range`, detail: "Strong bond rally" };
    }),
  ],
};

// ═══════════════════════════════════════════════════
// 11. SOVEREIGN DEBT STRESS
// ═══════════════════════════════════════════════════
const sovereignDebtStress: PlaybookEvent = {
  id: "sovereign-debt-stress",
  name: "Sovereign Debt Stress",
  category: "financial-system",
  description:
    "TLT falling despite risk-off, DXY weakening, gold spiking. Markets losing confidence in sovereign credit.",
  historicalContext:
    "2011 US downgrade, 2022 UK gilt crisis, periodic EM sovereign defaults. When bonds and currency fall together, it signals sovereign risk.",
  implications: [
    "Gold as ultimate safe haven",
    "Avoid long-duration government bonds",
    "Currency hedging becomes critical",
    "Hard assets outperform paper",
  ],
  triggers: [
    trigger("tlt-falling-risk-off", "TLT falling despite risk-off", (s) => {
      const tltPos = etfRangePosition(s, "TLT");
      const vix = s.sentiment?.vix.value;
      if (tltPos === null || vix === null || vix === undefined)
        return { firing: false, value: "N/A", detail: "No data" };
      // TLT falling while VIX elevated = bonds not acting as safe haven
      return {
        firing: tltPos < 35 && vix > 20,
        value: `TLT: ${tltPos}%, VIX: ${vix.toFixed(0)}`,
        detail: "Bonds not providing safety",
      };
    }),
    trigger("dxy-weakening", "DXY weakening", (s) => {
      const dxy = s.gold?.dxy?.price;
      if (dxy === null || dxy === undefined) return { firing: false, value: "N/A", detail: "No data" };
      return { firing: dxy < 98, value: dxy.toFixed(1), detail: "Dollar weakness" };
    }),
    trigger("gold-spiking", "Gold spiking", (s) => {
      const gold = s.gold?.livePrice;
      const ath = s.gold?.analysis?.ath;
      if (gold === null || gold === undefined) return { firing: false, value: "N/A", detail: "No data" };
      const nearAth = ath ? gold / ath > 0.92 : false;
      return { firing: nearAth, value: `$${gold.toFixed(0)}`, detail: "Near ATH — sovereign hedge" };
    }),
    trigger("debt-elevated", "Debt/GDP elevated", (s) => {
      const debt = indicatorValue(s, "debt-to-gdp");
      if (debt === null) return { firing: false, value: "N/A", detail: "No data" };
      return { firing: debt > 100, value: `${debt.toFixed(0)}%`, detail: debt > 120 ? "Critical" : "Elevated" };
    }),
    trigger("deficit-elevated", "Deficit/GDP elevated", (s) => {
      const deficit = indicatorValue(s, "deficit-to-gdp");
      if (deficit === null) return { firing: false, value: "N/A", detail: "No data" };
      const abs = Math.abs(deficit);
      return { firing: abs > 5, value: `${abs.toFixed(1)}%`, detail: abs > 8 ? "Unsustainable" : "High" };
    }),
  ],
};

// ═══════════════════════════════════════════════════
// 12. CARRY TRADE UNWIND
// ═══════════════════════════════════════════════════
const carryTradeUnwind: PlaybookEvent = {
  id: "carry-trade-unwind",
  name: "Carry Trade Unwind",
  category: "financial-system",
  description:
    "Yen strengthening sharply, VIX spiking, cross-asset volatility. Leveraged positions being unwound globally.",
  historicalContext:
    "July 2024 yen carry unwind: USD/JPY dropped from 161 to 142, Nikkei fell 12% in a day, VIX spiked to 65. 1998 LTCM involved similar dynamics.",
  implications: [
    "Expect correlated selling across assets",
    "JPY strength continues until positions clear",
    "VIX spike may create buying opportunity after",
    "Watch for BOJ policy signals",
  ],
  triggers: [
    trigger("dxy-dropping", "DXY dropping (yen proxy)", (s) => {
      const dxy = s.gold?.dxy?.price;
      const dxyChange = s.gold?.dxy?.changePercent;
      if (dxy === null || dxy === undefined) return { firing: false, value: "N/A", detail: "No data" };
      return {
        firing: (dxyChange !== null && dxyChange !== undefined && dxyChange < -0.5) || dxy < 100,
        value: dxy.toFixed(1),
        detail: "Dollar weakening vs carry currencies",
      };
    }),
    trigger("vix-spiking", "VIX spiking", (s) => {
      const vix = s.sentiment?.vix.value;
      if (vix === null || vix === undefined) return { firing: false, value: "N/A", detail: "No data" };
      return { firing: vix > 25, value: vix.toFixed(1), detail: "Volatility spike" };
    }),
    trigger("breadth-washout", "Broad-based selling", (s) => {
      if (!s.breadth) return { firing: false, value: "N/A", detail: "No data" };
      const ratio = s.breadth.advanceDecline.ratio;
      return {
        firing: ratio !== null && ratio < 0.5,
        value: ratio !== null ? ratio.toFixed(2) : "N/A",
        detail: "Correlated selling",
      };
    }),
    trigger("vol-inversion", "Volatility term structure inverted", (s) => {
      const ts = s.sentiment?.volatilityContext?.termStructure;
      if (ts === null || ts === undefined) return { firing: false, value: "N/A", detail: "No data" };
      return { firing: ts < 1, value: ts.toFixed(2), detail: "Near-term fear > long-term" };
    }),
  ],
};

// ═══════════════════════════════════════════════════
// 13. BUBBLE / EUPHORIA PEAK
// ═══════════════════════════════════════════════════
const bubblePeak: PlaybookEvent = {
  id: "bubble-peak",
  name: "Bubble / Euphoria Peak",
  category: "market-structure",
  description:
    "VIX very low, put/call ratio low, breadth diverging (narrow leadership), tech extremely extended.",
  historicalContext:
    "2000 dot-com peak: VIX compressed, breadth terrible despite new index highs, tech at 100x P/E. 2021 meme/SPAC mania had similar characteristics.",
  implications: [
    "Reduce risk — position sizes and leverage",
    "Breadth divergence is a major warning",
    "Don't short too early — bubbles persist",
    "Hedge with put spreads",
  ],
  triggers: [
    trigger("vix-low", "VIX very low (<15)", (s) => {
      const vix = s.sentiment?.vix.value;
      if (vix === null || vix === undefined) return { firing: false, value: "N/A", detail: "No data" };
      return { firing: vix < 15, value: vix.toFixed(1), detail: "Complacency" };
    }),
    trigger("putcall-low", "Put/call ratio low", (s) => {
      const pc = s.sentiment?.putCall.value;
      if (pc === null || pc === undefined) return { firing: false, value: "N/A", detail: "No data" };
      return { firing: pc < 0.7, value: pc.toFixed(2), detail: "Excessive bullishness" };
    }),
    trigger("breadth-diverging", "Breadth diverging (narrow leadership)", (s) => {
      if (!s.breadth) return { firing: false, value: "N/A", detail: "No data" };
      const nh = s.breadth.newHighsLows.newHighs;
      const nl = s.breadth.newHighsLows.newLows;
      // Few new highs while index is near highs = narrow leadership
      if (nh === null) return { firing: false, value: "N/A", detail: "No data" };
      return {
        firing: nh < 100 && (nl !== null && nl > 50),
        value: `${nh} highs / ${nl ?? 0} lows`,
        detail: "Narrow market",
      };
    }),
    trigger("tech-extended", "XLK extremely extended", (s) => {
      const rs = sectorRelStrength(s, "technology", "3m");
      if (rs === null) return { firing: false, value: "N/A", detail: "No data" };
      return { firing: rs > 5, value: `${rs > 0 ? "+" : ""}${rs.toFixed(1)}%`, detail: "vs SPY 3M" };
    }),
    trigger("insider-selling", "Insider selling elevated", (s) => {
      if (!s.insider) return { firing: false, value: "N/A", detail: "No data" };
      return {
        firing: s.insider.ratio < 0.1,
        value: s.insider.ratio.toFixed(2),
        detail: "Heavy insider selling",
      };
    }),
  ],
};

// ═══════════════════════════════════════════════════
// 14. CAPITULATION / PANIC BOTTOM
// ═══════════════════════════════════════════════════
const panicBottom: PlaybookEvent = {
  id: "panic-bottom",
  name: "Capitulation / Panic Bottom",
  category: "market-structure",
  description:
    "VIX >35, put/call >1.2, breadth washout, McClellan deeply negative, insider buying surging. Classic panic bottom signals.",
  historicalContext:
    "March 2020 bottom: VIX hit 82, put/call spiked to 1.5+, McClellan oscillator hit -80. March 2009 GFC bottom had similar readings.",
  implications: [
    "High-conviction buying opportunity forming",
    "Wait for VIX to peak and start declining",
    "Insider cluster buying is strongest signal",
    "Dollar-cost average — don't all-in at once",
  ],
  triggers: [
    trigger("vix-extreme", "VIX >35", (s) => {
      const vix = s.sentiment?.vix.value;
      if (vix === null || vix === undefined) return { firing: false, value: "N/A", detail: "No data" };
      return { firing: vix > 35, value: vix.toFixed(1), detail: vix > 50 ? "Extreme panic" : "Fear" };
    }),
    trigger("putcall-extreme", "Put/call >1.2", (s) => {
      const pc = s.sentiment?.putCall.value;
      if (pc === null || pc === undefined) return { firing: false, value: "N/A", detail: "No data" };
      return { firing: pc > 1.2, value: pc.toFixed(2), detail: "Extreme fear" };
    }),
    trigger("breadth-washout", "Breadth washout", (s) => {
      if (!s.breadth) return { firing: false, value: "N/A", detail: "No data" };
      const ratio = s.breadth.advanceDecline.ratio;
      return {
        firing: ratio !== null && ratio < 0.3,
        value: ratio !== null ? ratio.toFixed(2) : "N/A",
        detail: "Extreme selling",
      };
    }),
    trigger("mcclellan-negative", "McClellan deeply negative", (s) => {
      const mc = s.breadth?.mcclellan?.oscillator;
      if (mc === null || mc === undefined) return { firing: false, value: "N/A", detail: "No data" };
      return { firing: mc < -50, value: mc.toFixed(0), detail: mc < -100 ? "Extreme" : "Deeply negative" };
    }),
    trigger("insider-buying", "Insider buying surging", (s) => {
      if (!s.insider) return { firing: false, value: "N/A", detail: "No data" };
      return {
        firing: s.insider.ratio > 0.5 && s.insider.clusterBuys.length > 3,
        value: `Ratio: ${s.insider.ratio.toFixed(2)}`,
        detail: `${s.insider.clusterBuys.length} cluster buys`,
      };
    }),
  ],
};

// ═══════════════════════════════════════════════════
// 15. SECTOR ROTATION
// ═══════════════════════════════════════════════════
const sectorRotation: PlaybookEvent = {
  id: "sector-rotation",
  name: "Sector Rotation",
  category: "market-structure",
  description:
    "Composite score divergence widening, momentum trends shifting. Leadership changing hands across sectors.",
  historicalContext:
    "2020-2021: tech → cyclicals → energy. 2022: growth → value/energy. Rotations signal changing economic expectations.",
  implications: [
    "Follow relative strength — momentum persists",
    "Fading sectors rarely bounce quickly",
    "Watch for acceleration/deceleration signals",
    "Breadth may improve as rotation broadens",
  ],
  triggers: [
    trigger("score-divergence", "Composite score spread widening", (s) => {
      if (s.sectors.length < 3) return { firing: false, value: "N/A", detail: "No data" };
      const scores = s.sectors.map((sec) => sec.composite_score).filter((sc): sc is number => sc !== null);
      if (scores.length < 3) return { firing: false, value: "N/A", detail: "Insufficient data" };
      const spread = Math.max(...scores) - Math.min(...scores);
      return {
        firing: spread > 10,
        value: `${spread.toFixed(1)}%`,
        detail: "Wide dispersion",
      };
    }),
    trigger("momentum-shifts", "Multiple sectors changing momentum", (s) => {
      const decelerating = s.sectors.filter((sec) => sec.momentum_trend === "decelerating").length;
      const accelerating = s.sectors.filter((sec) => sec.momentum_trend === "accelerating").length;
      const total = decelerating + accelerating;
      return {
        firing: total >= 5,
        value: `${accelerating} acc / ${decelerating} dec`,
        detail: "Active rotation",
      };
    }),
    trigger("rs-reversals", "Relative strength reversals", (s) => {
      // Count sectors where 1w RS and 3m RS have different signs
      const reversals = s.sectors.filter((sec) => {
        if (sec.relative_strength_1w === null || sec.relative_strength_3m === null) return false;
        return (sec.relative_strength_1w > 0 && sec.relative_strength_3m < -1) ||
               (sec.relative_strength_1w < 0 && sec.relative_strength_3m > 1);
      }).length;
      return {
        firing: reversals >= 3,
        value: `${reversals} sectors`,
        detail: "Short vs long-term divergence",
      };
    }),
    trigger("leader-change", "Top sector changing", (s) => {
      if (s.sectors.length < 2) return { firing: false, value: "N/A", detail: "No data" };
      const top = s.sectors[0];
      if (!top || top.composite_score === null) return { firing: false, value: "N/A", detail: "No data" };
      // Check if top sector's momentum is decelerating (may lose leadership)
      return {
        firing: top.momentum_trend === "decelerating",
        value: top.name,
        detail: "Leader decelerating",
      };
    }),
  ],
};

// ═══════════════════════════════════════════════════
// 16. INFLATION REGIME CHANGE
// ═══════════════════════════════════════════════════
const inflationRegimeChange: PlaybookEvent = {
  id: "inflation-regime",
  name: "Inflation Regime Change",
  category: "structural",
  description:
    "CPI/PCE trending up, gold rallying, energy outperforming, TLT falling. Structural shift in inflation expectations.",
  historicalContext:
    "2021-2022 inflation surge: CPI went from 1.4% to 9.1%. Gold, energy, and commodities outperformed massively. Bonds had worst year in history.",
  implications: [
    "Shorten duration — bonds lose value",
    "Commodity exposure as inflation hedge",
    "TIPS over nominal treasuries",
    "Pricing power stocks outperform",
  ],
  triggers: [
    trigger("cpi-rising", "CPI trending up", (s) => {
      const cpi = indicatorValue(s, "cpi");
      if (cpi === null) return { firing: false, value: "N/A", detail: "No data" };
      return { firing: cpi > 3.5, value: `${cpi.toFixed(1)}%`, detail: "Above target" };
    }),
    trigger("pce-rising", "PCE trending up", (s) => {
      const pce = indicatorValue(s, "pce");
      if (pce === null) return { firing: false, value: "N/A", detail: "No data" };
      return { firing: pce > 3, value: `${pce.toFixed(1)}%`, detail: "Above target" };
    }),
    trigger("gold-rallying", "Gold rallying", (s) => {
      const gold = s.gold?.livePrice;
      const ath = s.gold?.analysis?.ath;
      if (gold === null || gold === undefined) return { firing: false, value: "N/A", detail: "No data" };
      const nearAth = ath ? gold / ath > 0.9 : false;
      return { firing: nearAth, value: `$${gold.toFixed(0)}`, detail: "Near ATH — inflation hedge" };
    }),
    trigger("xle-outperforming", "XLE outperforming", (s) => {
      const rs = sectorRelStrength(s, "energy");
      if (rs === null) return { firing: false, value: "N/A", detail: "No data" };
      return { firing: rs > 2, value: `${rs > 0 ? "+" : ""}${rs.toFixed(1)}%`, detail: "vs SPY" };
    }),
    trigger("tlt-falling", "TLT falling", (s) => {
      const pos = etfRangePosition(s, "TLT");
      if (pos === null) return { firing: false, value: "N/A", detail: "No data" };
      return { firing: pos < 35, value: `${pos}% of 52w range`, detail: "Bond selloff" };
    }),
    trigger("real-yields-negative", "Real yields negative or declining", (s) => {
      const ry = s.gold?.realYields?.value;
      if (ry === null || ry === undefined) return { firing: false, value: "N/A", detail: "No data" };
      return { firing: ry < 0.5, value: `${ry.toFixed(2)}%`, detail: ry < 0 ? "Negative" : "Low" };
    }),
  ],
};

// ═══════════════════════════════════════════════════
// 17. DOLLAR REGIME SHIFT
// ═══════════════════════════════════════════════════
const dollarRegimeShift: PlaybookEvent = {
  id: "dollar-regime",
  name: "Dollar Regime Shift",
  category: "structural",
  description:
    "DXY moving strongly in one direction, affecting gold inversely, EM assets, and commodities. Dollar as the macro pivot.",
  historicalContext:
    "2014-2016 strong dollar crushed EM. 2017 weak dollar boosted everything. 2022 super-strong dollar was the dominant macro force.",
  implications: [
    "Strong DXY: headwind for EM, commodities, multinational earnings",
    "Weak DXY: tailwind for gold, EM, commodities",
    "Dollar direction often persists for quarters",
    "Watch Fed policy divergence as driver",
  ],
  triggers: [
    trigger("dxy-extreme", "DXY at extreme", (s) => {
      const dxy = s.gold?.dxy?.price;
      if (dxy === null || dxy === undefined) return { firing: false, value: "N/A", detail: "No data" };
      return {
        firing: dxy > 108 || dxy < 95,
        value: dxy.toFixed(1),
        detail: dxy > 108 ? "Very strong" : dxy < 95 ? "Very weak" : "Normal",
      };
    }),
    trigger("gold-inverse", "Gold inversely correlated", (s) => {
      const gold = s.gold?.livePrice;
      const ath = s.gold?.analysis?.ath;
      const dxy = s.gold?.dxy?.price;
      if (gold === null || gold === undefined || dxy === null || dxy === undefined)
        return { firing: false, value: "N/A", detail: "No data" };
      const goldPercOfAth = ath ? gold / ath : 0;
      // Strong DXY + weak gold, or weak DXY + strong gold (ATH-relative)
      return {
        firing: (dxy > 105 && goldPercOfAth < 0.85) || (dxy < 98 && goldPercOfAth > 0.95),
        value: `DXY: ${dxy.toFixed(0)}, Gold: ${(goldPercOfAth * 100).toFixed(0)}% ATH`,
        detail: "Classic inverse relationship",
      };
    }),
    trigger("dxy-momentum", "DXY change significant", (s) => {
      const dxyChange = s.gold?.dxy?.changePercent;
      if (dxyChange === null || dxyChange === undefined)
        return { firing: false, value: "N/A", detail: "No data" };
      return {
        firing: Math.abs(dxyChange) > 0.3,
        value: `${dxyChange > 0 ? "+" : ""}${dxyChange.toFixed(2)}%`,
        detail: dxyChange > 0 ? "Dollar strengthening" : "Dollar weakening",
      };
    }),
    trigger("materials-impact", "Materials sector impacted", (s) => {
      const rs = sectorRelStrength(s, "materials");
      if (rs === null) return { firing: false, value: "N/A", detail: "No data" };
      return { firing: Math.abs(rs) > 3, value: `${rs.toFixed(1)}%`, detail: "Dollar-sensitive" };
    }),
  ],
};

// ═══════════════════════════════════════════════════
// 18. HARD ASSET SUPERCYCLE
// ═══════════════════════════════════════════════════
const hardAssetSupercycle: PlaybookEvent = {
  id: "hard-asset-supercycle",
  name: "Hard Asset Supercycle",
  category: "structural",
  description:
    "Gold near ATH, BTC Mayer Multiple rising, energy/materials outperforming tech, DXY weakening. Real assets over financial assets.",
  historicalContext:
    "2001-2011 commodity supercycle: gold 5x, oil 10x, mining stocks 8x. Driven by weak dollar, China demand, and underinvestment in supply.",
  implications: [
    "Overweight commodities, energy, materials",
    "Gold and BTC as monetary alternatives",
    "Underweight tech relative to real assets",
    "Weak dollar regime supports thesis",
  ],
  triggers: [
    trigger("gold-ath", "Gold near ATH", (s) => {
      const gold = s.gold?.livePrice;
      const ath = s.gold?.analysis?.ath;
      if (gold === null || gold === undefined) return { firing: false, value: "N/A", detail: "No data" };
      const nearAth = ath ? gold / ath > 0.9 : gold > 2200;
      return { firing: nearAth, value: `$${gold.toFixed(0)}`, detail: nearAth ? "Near all-time high" : "Below ATH" };
    }),
    trigger("btc-mayer", "BTC Mayer Multiple rising", (s) => {
      const mayer = s.btc?.mayerMultiple;
      if (mayer === null || mayer === undefined) return { firing: false, value: "N/A", detail: "No data" };
      return { firing: mayer > 1.0, value: mayer.toFixed(2), detail: mayer > 1.5 ? "Extended" : "Above avg" };
    }),
    trigger("xle-xlb-outperform", "XLE/XLB outperforming XLK", (s) => {
      const xle = sectorScore(s, "energy");
      const xlb = sectorScore(s, "materials");
      const xlk = sectorScore(s, "technology");
      if (xle === null || xlb === null || xlk === null)
        return { firing: false, value: "N/A", detail: "No data" };
      const realAvg = (xle + xlb) / 2;
      const diff = realAvg - xlk;
      return {
        firing: diff > 0,
        value: `${diff > 0 ? "+" : ""}${diff.toFixed(1)}%`,
        detail: "Real > financial assets",
      };
    }),
    trigger("dxy-weakening", "DXY weakening", (s) => {
      const dxy = s.gold?.dxy?.price;
      if (dxy === null || dxy === undefined) return { firing: false, value: "N/A", detail: "No data" };
      return { firing: dxy < 100, value: dxy.toFixed(1), detail: "Weak dollar supports commodities" };
    }),
    trigger("real-yields-low", "Real yields negative or very low", (s) => {
      const ry = s.gold?.realYields?.value;
      if (ry === null || ry === undefined) return { firing: false, value: "N/A", detail: "No data" };
      return { firing: ry < 0.5, value: `${ry.toFixed(2)}%`, detail: ry < 0 ? "Negative — bullish gold" : "Low" };
    }),
  ],
};

// ═══════════════════════════════════════════════════
// EXPORT ALL EVENTS
// ═══════════════════════════════════════════════════
export const PLAYBOOK_EVENTS: PlaybookEvent[] = [
  // Economic Cycle
  recessionOnset,
  stagflation,
  recoveryReflation,
  deflationaryBust,
  // Monetary
  tighteningStress,
  easingCycle,
  liquidityCrisis,
  // Geopolitical
  energyShock,
  tradeWar,
  warEscalation,
  insuranceCascade,
  // Financial System
  creditCrisis,
  sovereignDebtStress,
  carryTradeUnwind,
  // Market Structure
  bubblePeak,
  panicBottom,
  sectorRotation,
  // Structural
  inflationRegimeChange,
  dollarRegimeShift,
  hardAssetSupercycle,
];
