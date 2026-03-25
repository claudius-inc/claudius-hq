# Stock Scanner Scoring Modes

## Overview

The scanner supports 3 scoring modes, each optimized for a different investment philosophy. The **Combined Score** averages all three modes equally.

---

## 🔢 QUANT MODE (100 pts)

*Factor-based scoring using academically validated metrics*

### Quality - Profitability: 25 pts
| Metric | Thresholds | Max |
|--------|------------|-----|
| ROE | >20%: 10, >15%: 7, >10%: 4 | 10 |
| Gross Margin | >50%: 8, >40%: 6, >30%: 4 | 8 |
| FCF Positive | Yes: 7, No: 0 | 7 |

### Quality - Stability: 15 pts
| Metric | Thresholds | Max |
|--------|------------|-----|
| Debt/Equity | <30%: 8, <60%: 5, <100%: 2 | 8 |
| Earnings Positive | Yes: 7, No: 0 | 7 |

### Value: 25 pts
| Metric | Thresholds | Max |
|--------|------------|-----|
| EV/EBITDA | <8: 10, <12: 7, <16: 4 | 10 |
| P/B | <1.5: 8, <2.5: 5, <4: 2 | 8 |
| FCF Yield | >8%: 7, >5%: 5, >3%: 3 | 7 |

### Momentum: 15 pts
| Metric | Thresholds | Max |
|--------|------------|-----|
| Price vs SMA200 | >10%: 8, >0%: 5, >-10%: 2 | 8 |
| Not Overextended | <25% above: 7, <40%: 4 | 7 |

### Size: 10 pts
| Market Cap | Points |
|------------|--------|
| $500M-$5B | 10 |
| $5B-$20B | 7 |
| $20B-$100B | 4 |
| >$100B | 2 |

### Shareholder Yield: 10 pts
| Div + Buyback Yield | Points |
|---------------------|--------|
| >4% | 10 |
| >2% | 6 |
| >1% | 3 |

---

## 💰 VALUE MODE (100 pts)

*Buffett/Klarman style: margin of safety, cash generation, durability*

### Valuation: 40 pts
| Metric | Thresholds | Max |
|--------|------------|-----|
| EV/EBITDA | <6: 12, <8: 10, <10: 7, <14: 4 | 12 |
| Earnings Yield Spread (vs 10Y) | >6%: 10, >4%: 8, >2%: 5 | 10 |
| P/FCF | <10: 10, <15: 7, <20: 4 | 10 |
| P/B | <1: 8, <1.5: 6, <2.5: 4 | 8 |

### Cash Generation: 25 pts
| Metric | Thresholds | Max |
|--------|------------|-----|
| FCF Yield | >10%: 10, >7%: 8, >5%: 6 | 10 |
| FCF Margin | >20%: 8, >12%: 6, >6%: 4 | 8 |
| FCF/Debt | >0.5: 7, >0.25: 5, >0.15: 3 | 7 |

### Quality & Durability: 25 pts
| Metric | Thresholds | Max |
|--------|------------|-----|
| ROIC | >20%: 10, >15%: 8, >12%: 6 | 10 |
| Interest Coverage | >10x: 6, >6x: 5, >4x: 3 | 6 |
| Debt/Equity | <30%: 5, <60%: 4, <100%: 3 | 5 |
| ROE | >18%: 4, >12%: 3, >8%: 2 | 4 |

### Dividend: 10 pts
| Metric | Thresholds | Max |
|--------|------------|-----|
| Dividend Yield | >4%: 5, >2.5%: 4, >1.5%: 3 | 5 |
| Payout Ratio | 20-50%: 5, 50-70%: 4, 10-20%: 3 | 5 |

### Value Trap Flags (Info Only)
- 🔴 Falling Knife: 6M return < -40%
- 🔴 Cash Burn: FCF negative 2+ years
- 🟡 Margin Deterioration: GM down >5pp YoY

---

## 🚀 GROWTH MODE (100 pts)

*Hypergrowth-friendly: revenue velocity, scalability, unit economics*

### Revenue Growth: 40 pts
| Metric | Thresholds | Max |
|--------|------------|-----|
| 3Y CAGR | >100%: 15, >50%: 11, >25%: 7 | 15 |
| YoY Growth | >150%: 15, >75%: 11, >35%: 7 | 15 |
| QoQ Growth | >30%: 10, >15%: 6, >5%: 2 | 10 |

### Growth Durability: 15 pts
| Metric | Thresholds | Max |
|--------|------------|-----|
| Acceleration | Accel >10pp: 8, >5pp: 6, stable: 4 | 8 |
| Consistency | 4/4 Q positive: 7, 3/4: 5 | 7 |

### Scalability: 15 pts
| Metric | Thresholds | Max |
|--------|------------|-----|
| Gross Margin | >70%: 10, >60%: 8, >50%: 6, >40%: 4 | 10 |
| GM Trend | Improving >3pp: 5, stable: 3 | 5 |

### Momentum: 15 pts
| Metric | Thresholds | Max |
|--------|------------|-----|
| 6M Return | >50%: 8, >30%: 7, >15%: 5 | 8 |
| 3M Return | >25%: 7, >15%: 5, >5%: 4 | 7 |

### TAM Proxy: 15 pts
| Metric | Thresholds | Max |
|--------|------------|-----|
| P/S-to-Growth Ratio | <0.1: 10, <0.2: 8, <0.3: 6 | 10 |
| Market Cap Sweet Spot | $500M-$5B: 5, $5B-$20B: 4 | 5 |

### Hypergrowth Exception Rules
- **Profitability Bypass**: If YoY >100%, FCF/net income ignored
- **GM Gate**: Must have GM ≥40% even for hypergrowth
- **Bonus +5 pts**: If YoY >150% AND GM >50% AND accelerating

---

## Combined Score

```
Combined = (Quant + Value + Growth) / 3
```

Stocks scoring high across all three modes are rare "universal quality" opportunities.

---

## Tier Classification

| Score | Tier | Interpretation |
|-------|------|----------------|
| ≥80 | 🟢 HIGH CONVICTION | Strong across multiple factors |
| 65-79 | 🔵 WATCHLIST | Good score, worth researching |
| 50-64 | 🟡 SPECULATIVE | Mixed signals, higher risk |
| <50 | 🔴 AVOID | Poor multi-factor profile |

---

## Data Sources

All metrics from Yahoo Finance API:
- `financialData`: ROE, ROIC, margins, FCF
- `defaultKeyStatistics`: P/E, P/B, EV/EBITDA, beta
- `earnings`: Quarterly revenue/earnings
- `price`: Market cap, 52w range
- `summaryDetail`: Dividend yield

---

*Last updated: March 2026*
