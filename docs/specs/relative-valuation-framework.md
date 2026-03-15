# Relative Valuation Framework

**Status:** Spec  
**Author:** Claudius  
**Date:** 2026-03-15

## Problem Statement

Current HQ shows individual asset signals but lacks:
1. **Expected returns** based on valuation (strategic layer)
2. **Relative comparison** across asset classes
3. **Tactical overlay** for timing within secular trends
4. **Correlation awareness** for portfolio construction

When S&P trades at PE 30, historical data shows ~0% median annualized return over 10 years. Investors need this context to allocate across equities, gold, BTC, and bonds.

## Core Concept: Two-Layer Framework

### Layer 1: Strategic (Valuation → Expected Returns)
- Long-term (5-10 year) expected real returns
- Based on current valuation vs historical outcomes
- Answers: "Where should long-term capital be?"

### Layer 2: Tactical (Short-term Positioning)  
- Bear markets have 20%+ rallies (5 so far in current cycle)
- In a 3% expected return world, capturing 20% = 6 years of returns
- Answers: "When do I lean in/out?"

---

## Asset-Specific Valuation Models

### S&P 500

**Primary Metric:** Shiller CAPE (Cyclically Adjusted PE)

| CAPE Range | Historical 10Y Real Return (Median) |
|------------|-------------------------------------|
| < 10       | 10-12% |
| 10-15      | 8-10% |
| 15-20      | 5-7% |
| 20-25      | 2-4% |
| 25-30      | 0-2% |
| > 30       | -1% to 1% |

**Data Sources:**
- Shiller CAPE: multpl.com/shiller-pe or FRED
- Trailing PE: Yahoo Finance (^GSPC)

**Tactical Signals:**
- 200 DMA cross (price vs SMA200)
- Market breadth (% stocks > 50 DMA)
- VIX term structure (contango/backwardation)
- Put/call ratio extremes

---

### Gold

**Primary Metrics:**

1. **Gold/M2 Ratio**
   - Gold price / M2 money supply (in billions)
   - Historical range: 2.0 (cheap) to 8.0 (expensive)
   - Current: ~4.5 (mid-range)
   - Interpretation: Lower = gold undervalued vs money supply

2. **Real Rate Environment**
   - TIPS yield as primary driver
   - Negative real rates → gold attractive
   - Positive real rates → gold headwind

3. **Relative to S&P Expected Return**
   - If S&P expected return is 0%, gold's 0% + inflation hedge becomes relatively attractive

**Expected Return Model:**
```
Gold 10Y Expected Return ≈ 
  Inflation expectation (2-3%)
  + Mean reversion of Gold/M2 ratio
  + Real rate trajectory
```

**Tactical Signals:**
- Price vs 200 DMA
- CFTC positioning extremes
- ETF flow momentum
- Central bank buying pace

---

### Bitcoin

**Primary Metrics:**

1. **MVRV (Market Value to Realized Value)**
   - MV = current market cap
   - RV = sum of all coins at their last moved price
   - MVRV > 3.5 = historically overvalued
   - MVRV < 1.0 = historically undervalued

2. **Stock-to-Flow Model** (controversial but referenced)
   - Based on scarcity (halving schedule)
   - Current S2F model price vs actual price

3. **Halving Cycle Position**
   - ~4 year cycles: halving → 12-18mo rally → bear
   - Current position in cycle

4. **NVT (Network Value to Transactions)**
   - Like PE ratio for Bitcoin
   - High NVT = overvalued, low NVT = undervalued

**Data Sources:**
- MVRV: Glassnode, CoinMetrics (require API key)
- On-chain metrics: blockchain.com
- Price: CoinGecko, Yahoo Finance (BTC-USD)

**Tactical Signals:**
- Price vs 200 DMA
- Funding rates (perp futures)
- Exchange inflows/outflows
- Stablecoin supply ratio

---

### Bonds (10Y Treasury)

**Primary Metric:** Yield to Maturity

- Current 10Y yield ≈ expected 10Y return
- Simple: if yield is 4.3%, expected return ≈ 4.3%

**Relative Consideration:**
- Real yield = nominal - inflation expectation
- Comparison: if stocks expect 0% and bonds yield 4.3%, bonds are relatively attractive

---

## Correlation Matrix

Rolling 60-day correlations between:
- S&P 500 (SPY)
- Gold (GLD)
- Bitcoin (BTC)
- 10Y Treasury (TLT)
- Dollar (DXY)

**Purpose:**
- Identify diversification opportunities
- Detect regime changes (correlations shift in crises)
- Inform position sizing

**Implementation:**
```typescript
// Fetch 60 days of daily returns
// Calculate correlation matrix
// Flag when correlations deviate from historical norms
```

---

## UI Design

### Expected Returns Card (New)

```
┌─────────────────────────────────────────────┐
│  EXPECTED RETURNS (10Y Real)                │
├─────────────────────────────────────────────┤
│  S&P 500    ████░░░░░░  0.5%   PE: 30      │
│  Gold       ██████░░░░  3.2%   Au/M2: 4.5  │
│  Bitcoin    ████████░░  6.8%   MVRV: 1.8   │
│  Bonds      ██████░░░░  4.3%   Yield: 4.3% │
├─────────────────────────────────────────────┤
│  Relative Winner: BTC > Bonds > Gold > SPX │
└─────────────────────────────────────────────┘
```

### Tactical Signal Overlay

Each asset shows:
- Strategic view (expected return quintile)
- Tactical view (current momentum/sentiment)

```
┌─────────────────────────────────────────────┐
│  S&P 500                                    │
│  Strategic: AVOID (PE too high)             │
│  Tactical:  NEUTRAL (at 200 DMA)            │
│                                             │
│  Interpretation: Underweight, but don't     │
│  short — watch for tactical rally signals   │
└─────────────────────────────────────────────┘
```

### Correlation Heatmap

```
         SPY    GLD    BTC    TLT
  SPY    1.00  -0.12   0.45  -0.32
  GLD   -0.12   1.00   0.18   0.28
  BTC    0.45   0.18   1.00  -0.15
  TLT   -0.32   0.28  -0.15   1.00
  
  ⚠️ BTC-SPY correlation elevated (0.45)
```

---

## Data Requirements

| Data Point | Source | Update Frequency |
|------------|--------|------------------|
| S&P PE/CAPE | multpl.com or Yahoo | Daily |
| M2 Money Supply | FRED M2SL | Weekly (Thursday) |
| TIPS Yield | FRED DFII10 | Daily |
| BTC MVRV | Glassnode API | Daily |
| Price data | Yahoo Finance | Real-time |
| Correlations | Calculated | Daily |

### API Keys Needed
- FRED (have it)
- Glassnode (need for MVRV) — or use free alternatives

---

## Implementation Phases

### Phase 1: Expected Returns Card
- S&P PE → expected return lookup table
- Gold/M2 ratio calculation
- BTC: use simple halving cycle position (no MVRV yet)
- Bonds: just show yield

### Phase 2: Tactical Overlay
- Add 200 DMA status for each asset
- Add sentiment indicators (existing work)
- Combined view: "Strategic + Tactical"

### Phase 3: Correlation Matrix
- Calculate rolling correlations
- Display heatmap
- Alert on regime changes

### Phase 4: BTC Deep Metrics
- Integrate Glassnode or alternative
- Add MVRV, NVT, exchange flows

---

## Technical Notes

### File Structure
```
/src/lib/valuation/
  ├── expected-returns.ts   // Models for each asset
  ├── correlations.ts       // Correlation calculations
  └── types.ts              // Shared types

/src/app/api/valuation/
  ├── expected-returns/route.ts
  └── correlations/route.ts

/src/app/markets/_components/
  ├── ExpectedReturnsCard.tsx
  └── CorrelationMatrix.tsx
```

### Caching
- Expected returns: cache 1 hour (valuations don't change fast)
- Correlations: cache 4 hours (daily recalc is fine)
- Store in existing market-cache system

---

## Success Metrics

1. User can see relative attractiveness of assets at a glance
2. Strategic vs tactical distinction is clear
3. Correlation awareness prevents concentrated bets
4. System helps identify 20%+ rally opportunities in bear markets

---

## Open Questions

1. **MVRV data source** — Glassnode is expensive. Alternatives: CoinMetrics, free on-chain APIs?
2. **Backtest validation** — Should we show historical accuracy of the models?
3. **Rebalancing signals** — Auto-generate "consider rebalancing" when relative values shift significantly?
4. **Integration with portfolio** — Connect to existing portfolio holdings to show personalized allocation advice?

---

## References

- Shiller, Robert. "Irrational Exuberance" — CAPE methodology
- Hussman, John. "Expected Returns" research
- PlanB. "Stock-to-Flow" model (Bitcoin)
- Glassnode. "MVRV" documentation
