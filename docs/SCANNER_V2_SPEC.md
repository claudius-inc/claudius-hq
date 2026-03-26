# Scanner V2 Specification
## Multi-Market Stock Scanner with Market-Aware Scoring

**Version:** 2.0  
**Date:** 2026-03-26  
**Markets:** US, JP, CN, HK, SG

---

## 1. Architecture Overview

### 1.1 Design Principles

1. **Market-aware scoring** — Percentile ranks within market, not global
2. **Missing data = neutral** — Don't penalize for unavailable fields
3. **Universal core + market-specific signals** — Same base metrics, plus local alpha
4. **Sector-specific rules** — Banks/financials use alternate metrics

### 1.2 Data Sources by Market

| Market | Primary | Secondary | Event Signals |
|--------|---------|-----------|---------------|
| **US** | Yahoo Finance | SEC EDGAR | OpenInsider, Barchart Options |
| **JP** | Yahoo Finance | EDINET API | TDnet, JPX |
| **CN** | Yahoo Finance | AkShare | Stock Connect flows |
| **HK** | Yahoo Finance | AkShare | HKEX CCASS, Short Selling |
| **SG** | Yahoo Finance | SGinvestors.io | reitdata.com |

---

## 2. Universal Metrics (All Markets)

These fields are consistently available via Yahoo Finance across all 5 markets.

### 2.1 Core Scoring Metrics

| Metric | Yahoo Field | Category | Notes |
|--------|-------------|----------|-------|
| Return on Equity | `returnOnEquity` | Quality | Universal |
| Return on Assets | `returnOnAssets` | Quality | Universal |
| Trailing P/E | `trailingPE` | Value | Universal |
| Price to Book | `priceToBook` | Value | Universal |
| Dividend Yield | `dividendYield` | Income | Universal |
| Payout Ratio | `payoutRatio` | Income | Universal |
| Market Cap | `marketCap` | Size | Universal |
| Trailing EPS | `trailingEps` | Earnings | Universal |
| Beta | `beta` | Risk | May be missing for small caps |
| Sector | `sector` | Classification | For sector-specific rules |
| Industry | `industry` | Classification | For sector-specific rules |

### 2.2 Financial Statement Metrics (Annual)

| Metric | Yahoo Module | Availability |
|--------|--------------|--------------|
| Total Revenue | `incomeStatementHistory` | ✅ All markets |
| Net Income | `incomeStatementHistory` | ✅ All markets |
| Total Assets | `balanceSheetHistory` | ✅ All markets |
| Total Liabilities | `balanceSheetHistory` | ✅ All markets |
| Stockholders Equity | `balanceSheetHistory` | ✅ All markets |
| Operating Cash Flow | `cashflowStatementHistory` | ✅ All markets |
| Capital Expenditures | `cashflowStatementHistory` | ✅ All markets |

### 2.3 Calculated Metrics

| Metric | Calculation | When to Use |
|--------|-------------|-------------|
| Free Cash Flow | `operatingCashflow - capitalExpenditures` | If `freeCashflow` missing |
| Gross Margin | `grossProfit / totalRevenue` | If `grossMargins` missing |
| Debt to Equity | `totalDebt / stockholdersEquity` | If `debtToEquity` missing |
| Gross Profitability | `(Revenue - COGS) / totalAssets` | Novy-Marx factor |
| Asset Growth | `(Assets_t - Assets_t-1) / Assets_t-1` | Investment factor |
| Accruals | `(NetIncome - OCF) / totalAssets` | Earnings quality |

---

## 3. Sector-Specific Handling

### 3.1 Financial Services (Banks, Insurance)

**Detection:** `sector == "Financial Services"`

**Skip these metrics:**
- grossMargins (N/A for banks)
- freeCashflow (N/A)
- currentRatio (N/A)
- debtToEquity (different meaning)
- enterpriseToEbitda (N/A)

**Use instead:**
- ROE, ROA (primary quality metrics)
- P/B (primary value metric)
- Dividend Yield, Payout Ratio
- NIM (if available)

**Scoring adjustment:**
```python
if sector == "Financial Services":
    # Score only on: ROE, ROA, P/E, P/B, Dividend
    # Weight ROE more heavily (banks live/die by ROE)
    quant_score = weighted_score([
        (roe_score, 0.40),
        (roa_score, 0.20),
        (pe_score, 0.20),
        (pb_score, 0.20),
    ])
```

### 3.2 REITs

**Detection:** `industry contains "REIT"`

**Key metrics:**
- Dividend Yield (DPU proxy)
- P/B as P/NAV
- Debt to Equity as Gearing (watch >45% threshold for SG REITs)

**Singapore REITs:** Flag if gearing >45% (MAS limit is 50%)

### 3.3 Biotech/Pre-Revenue

**Detection:** `industry == "Biotechnology" and revenue < threshold`

**Skip:** Profitability metrics, FCF
**Focus:** Cash runway, P/S, analyst coverage

---

## 4. Market-Specific Signals

### 4.1 United States 🇺🇸

#### Insider Transactions (SEC Form 4)
**Source:** OpenInsider.com (free), SEC EDGAR  
**Signal:** Cluster buys (3+ insiders in 30 days) = 68-75% win rate  
**Implementation:**
```python
# Scrape OpenInsider or use sec-api
def get_insider_clusters(ticker: str, days: int = 30) -> dict:
    # Return: insider_buy_count, total_value, is_cluster
```

#### Options Flow
**Source:** Barchart Unusual Options (free tier)  
**Signal:** Volume > Open Interest, call sweeps  
**Implementation:** Daily scrape of unusual activity page

#### 13F Holdings
**Source:** SEC EDGAR, WhaleWisdom  
**Signal:** Convergence (multiple whales entering)  
**Lag:** 45 days from quarter-end

### 4.2 Japan 🇯🇵

#### EDINET Large Shareholder Reports (5% filings)
**Source:** EDINET API (`api.edinet-fsa.go.jp`)  
**Auth:** Free API key (registration required)  
**Signal:** New 5%+ holders, changes in holdings  
**Implementation:**
```python
# Query daily: GET /documents.json?date=YYYY-MM-DD&type=2
# Look for 大量保有報告書 document types
```

#### TDnet Corporate Announcements
**Source:** TDnet (`release.tdnet.info`)  
**Signal:** Earnings beats, dividend changes, buybacks  
**Implementation:** `tdnet-disclosure-mcp` or scrape

#### Governance Catalyst (PBR<1)
**Source:** JPX Excel list (monthly)  
**Signal:** Companies newly disclosing capital efficiency plans  
**URL:** `jpx.co.jp/english/equities/follow-up/02.html`

### 4.3 China 🇨🇳

#### Stock Connect Flows ⭐ (Strongest Signal)
**Source:** AkShare  
**Signal:** Large northbound inflows predict rallies  
**Implementation:**
```python
import akshare as ak

# Daily flow summary
flows = ak.stock_hsgt_fund_flow_summary_em()

# Per-stock holdings
holdings = ak.stock_hsgt_hold_stock_em(indicator="今日排行")
# Columns: 代码, 今日持股-股数, 今日增持估计-市值, 占流通股比
```

#### China Insider Transactions
**Source:** AkShare  
**Signal:** Director buying clusters  
**Implementation:**
```python
insiders = ak.stock_inner_trade_xq()
# Columns: 股票代码, 变动日期, 变动人, 变动股数
```

#### Fund Holdings (Quarterly)
**Source:** AkShare  
**Signal:** Rising fund ownership = accumulation  
**Implementation:**
```python
fund_hold = ak.stock_report_fund_hold(symbol="基金持仓", date="20241231")
```

### 4.4 Hong Kong 🇭🇰

#### HKEX Short Selling
**Source:** HKEX website  
**URL:** `hkex.com.hk/Market-Data/Statistics/Securities-Market/Short-Selling-Turnover-Today`  
**Signal:** High short turnover ratio = potential squeeze  
**Update:** Daily, intraday

#### CCASS Shareholding
**Source:** HKEX news (`hkexnews.hk/sdw/search/searchsdw.aspx`)  
**Signal:** Broker-level position changes  
**Update:** Daily (12 months free)

#### Directors' Dealings
**Source:** HKEX Disclosure of Interests  
**URL:** `di.hkex.com.hk/di/summary/NSMSumMenu.htm`  
**Signal:** Substantial shareholder changes, director trades

### 4.5 Singapore 🇸🇬

#### REIT Metrics
**Source:** reitdata.com (scrape), Yahoo Finance  
**Metrics:** DPU, Yield, Gearing, P/NAV  
**Update:** Daily at 20:00 SGT

#### GLC Identification
**Source:** Static list (Temasek-linked)  
**Companies:**
```json
["D05.SI", "O39.SI", "U11.SI", "Z74.SI", "C6L.SI", "BN4.SI", "S63.SI", "S68.SI", "U96.SI"]
```

#### S-Chip Risk Flag
**Detection:** `country == "China"` with SGX listing  
**Signal:** Historical governance issues  
**Flag:** Add risk warning for China-domiciled SGX stocks

---

## 5. Scoring System

### 5.1 Three Modes (100 points each)

#### QUANT MODE
| Component | Points | Metrics |
|-----------|--------|---------|
| Quality - Profitability | 25 | ROE, Gross Margin, FCF Positive |
| Quality - Stability | 20 | D/E, Earnings Positive, Accruals |
| Value | 25 | EV/EBITDA, P/B, FCF Yield |
| Momentum | 15 | 12-1 month return |
| Shareholder Yield | 10 | Div + Buyback yield |
| Low Volatility | 5 | Beta <1 |

#### VALUE MODE
| Component | Points | Metrics |
|-----------|--------|---------|
| Valuation | 35 | EV/EBITDA, EY Spread, P/FCF, P/B |
| Cash Generation | 25 | FCF Yield, FCF Margin |
| Quality & Durability | 30 | ROIC (regional thresholds), D/E, ROE |
| Dividend | 10 | Yield, Payout Ratio |

**ROIC Regional Thresholds:**
- US: >15% for max points
- JP: >8% for max points
- HK/CN/SG: >10% for max points

#### GROWTH MODE
| Component | Points | Metrics |
|-----------|--------|---------|
| Revenue Growth | 40 | 3Y CAGR (max at >60%), YoY, QoQ |
| Growth Durability | 20 | Acceleration, Consistency |
| Scalability | 25 | GM, GM Trend, Rule of 40 (tech only) |
| Momentum | 5 | 3M return (mean reversion) |
| TAM Proxy | 10 | P/S-to-Growth, Market Cap sweet spot |

**Rule of 40:** Only for `sector == "Technology"` or `industry contains "Software"`

### 5.2 Missing Data Handling

```python
def score_metric(value, thresholds, max_points, market, metric_name):
    if value is None:
        # Option 1: Neutral score (50th percentile equivalent)
        return max_points * 0.5
        
        # Option 2: Market average (if we have it cached)
        # return market_average_score(market, metric_name)
    
    # Normal scoring logic
    return calculate_score(value, thresholds, max_points)
```

### 5.3 Percentile Ranking Within Market

```python
def calculate_percentile_score(ticker: str, metric: str, market: str) -> float:
    """
    Score metric as percentile within market universe.
    Returns 0-100 where 100 = top of market.
    """
    # Get all values for this metric in this market
    market_values = get_market_values(market, metric)
    
    if not market_values or ticker not in market_values:
        return 50.0  # Neutral
    
    value = market_values[ticker]
    percentile = scipy.stats.percentileofscore(market_values.values(), value)
    
    return percentile
```

---

## 6. Implementation Roadmap

### Phase 1: Core Foundation (Week 1)
- [ ] Update mode-scoring.ts with missing data handling
- [ ] Add sector detection and bank-specific scoring
- [ ] Implement percentile ranking within market
- [ ] Test with existing Yahoo Finance data

### Phase 2: Academic Factors (Week 2)
- [ ] Add Piotroski F-Score (9 binary signals)
- [ ] Add Gross Profitability (Novy-Marx)
- [ ] Add Investment Factor (asset growth)
- [ ] Add Accruals Quality

### Phase 3: Market-Specific Signals (Week 3-4)
- [ ] **US:** OpenInsider scraper for insider clusters
- [ ] **JP:** EDINET API integration (5% filings)
- [ ] **CN/HK:** AkShare integration (Stock Connect flows)
- [ ] **SG:** REIT metrics from reitdata.com

### Phase 4: Event-Driven Layer (Week 5+)
- [ ] Spinoff tracker (SEC 10-12B for US)
- [ ] Index rebalancing alerts
- [ ] Earnings surprise momentum

---

## 7. Data Pipeline Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         SCANNER V2 PIPELINE                         │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌───────────────────────────────────────────────────────────────┐ │
│  │                    PRIMARY: Yahoo Finance                      │ │
│  │  - Fundamentals (P/E, P/B, ROE, ROA, margins)                 │ │
│  │  - Financial statements (revenue, income, assets, cashflow)   │ │
│  │  - Sector/Industry classification                             │ │
│  │  - Coverage: US ✅ | JP ✅ | CN ✅ | HK ✅ | SG ✅             │ │
│  └───────────────────────────────────────────────────────────────┘ │
│                               │                                     │
│                               ▼                                     │
│  ┌───────────────────────────────────────────────────────────────┐ │
│  │                 MARKET-SPECIFIC ENRICHMENT                     │ │
│  │                                                                │ │
│  │  US:  OpenInsider → Insider clusters                          │ │
│  │       Barchart → Options flow                                  │ │
│  │       SEC EDGAR → 13F convergence                              │ │
│  │                                                                │ │
│  │  JP:  EDINET API → 5% filings, governance                     │ │
│  │       TDnet → Earnings, dividends                              │ │
│  │       JPX → Governance catalyst list                           │ │
│  │                                                                │ │
│  │  CN:  AkShare → Stock Connect flows, insider trades           │ │
│  │              → Fund holdings, IPO calendar                     │ │
│  │                                                                │ │
│  │  HK:  AkShare → Stock Connect, insider                        │ │
│  │       HKEX → Short selling, CCASS                              │ │
│  │                                                                │ │
│  │  SG:  SGinvestors.io → Announcements                          │ │
│  │       reitdata.com → REIT metrics                              │ │
│  └───────────────────────────────────────────────────────────────┘ │
│                               │                                     │
│                               ▼                                     │
│  ┌───────────────────────────────────────────────────────────────┐ │
│  │                    SCORING ENGINE                              │ │
│  │                                                                │ │
│  │  1. Detect market & sector                                    │ │
│  │  2. Apply sector-specific rules (banks → ROE/P/B focus)       │ │
│  │  3. Calculate Quant/Value/Growth scores                       │ │
│  │  4. Handle missing data (neutral, not zero)                   │ │
│  │  5. Percentile rank within market                             │ │
│  │  6. Add market-specific signals as bonus/flags                │ │
│  │  7. Output combined score + breakdowns                        │ │
│  └───────────────────────────────────────────────────────────────┘ │
│                               │                                     │
│                               ▼                                     │
│  ┌───────────────────────────────────────────────────────────────┐ │
│  │                    OUTPUT: Scanner Results                     │ │
│  │                                                                │ │
│  │  {                                                            │ │
│  │    ticker: "7203.T",                                         │ │
│  │    market: "JP",                                              │ │
│  │    sector: "Consumer Cyclical",                               │ │
│  │    quantScore: 72,                                            │ │
│  │    valueScore: 65,                                            │ │
│  │    growthScore: 48,                                           │ │
│  │    combinedScore: 62,                                         │ │
│  │    quantBreakdown: {...},                                     │ │
│  │    signals: {                                                 │ │
│  │      jp_5pct_filing: true,                                   │ │
│  │      governance_catalyst: false                               │ │
│  │    },                                                         │ │
│  │    flags: []                                                  │ │
│  │  }                                                            │ │
│  └───────────────────────────────────────────────────────────────┘ │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 8. Database Schema Updates

### 8.1 New Fields for scanner_results

```sql
ALTER TABLE stock_scans ADD COLUMN IF NOT EXISTS market_signals JSONB;
-- Contains market-specific signals like:
-- { "us_insider_cluster": true, "cn_northbound_inflow": 1500000, ... }

ALTER TABLE scanner_universe ADD COLUMN IF NOT EXISTS sector TEXT;
ALTER TABLE scanner_universe ADD COLUMN IF NOT EXISTS industry TEXT;
```

### 8.2 Market Percentile Cache

```sql
CREATE TABLE IF NOT EXISTS market_percentiles (
  market TEXT NOT NULL,
  metric TEXT NOT NULL,
  percentile_data JSONB NOT NULL, -- { "ticker": value, ... }
  calculated_at TIMESTAMP NOT NULL,
  PRIMARY KEY (market, metric)
);
```

---

## 9. API Endpoints

### 9.1 New/Updated Endpoints

```
GET  /api/scanner/universe?market=JP
POST /api/scanner/refresh
GET  /api/scanner/results?market=all&mode=combined
GET  /api/scanner/signals?ticker=7203.T  # Market-specific signals
```

---

## 10. Testing Strategy

### 10.1 Per-Market Test Cases

| Test | US | JP | CN | HK | SG |
|------|----|----|----|----|-----|
| Basic fundamentals | AAPL | 7203.T | 600519.SS | 0700.HK | D05.SI |
| Bank scoring | JPM | 8306.T | 601398.SS | 0005.HK | D05.SI |
| REIT scoring | O | 8951.T | — | 0823.HK | A17U.SI |
| Missing data | — | — | — | — | — |

### 10.2 Validation Queries

```python
# Ensure no market is systematically penalized
avg_scores = df.groupby('market')['combinedScore'].mean()
assert avg_scores.std() < 10  # Markets should be roughly balanced
```

---

## 11. Appendix: Data Source Details

### A. AkShare Functions for China/HK

```python
import akshare as ak

# Stock Connect
ak.stock_hsgt_fund_flow_summary_em()  # Daily summary
ak.stock_hsgt_hold_stock_em(indicator="今日排行")  # Per-stock holdings

# Insider Trades
ak.stock_inner_trade_xq()  # Real-time

# Fund Holdings
ak.stock_report_fund_hold(symbol="基金持仓", date="20241231")

# Index Constituents
ak.index_stock_cons_csindex(symbol="000300")  # CSI 300

# Bond Yields
ak.bond_china_yield()
```

### B. EDINET API for Japan

```python
import requests

BASE_URL = "https://api.edinet-fsa.go.jp/api/v2"
API_KEY = "your_key"

# Get documents for a date
response = requests.get(
    f"{BASE_URL}/documents.json",
    params={"date": "2026-03-25", "type": 2, "Subscription-Key": API_KEY}
)

# Filter for 大量保有報告書 (large shareholder reports)
docs = [d for d in response.json()["results"] if d["docTypeCode"] == "140"]
```

### C. OpenInsider Scraping for US

```python
import requests
from bs4 import BeautifulSoup

url = "http://openinsider.com/screener?s=&o=&pl=&ph=&ll=&lh=&fd=30&fdr=&td=0&tdr=&fown=&fowni=&fsp=&fsp1=&fsp2=&pt=1&cnt=100"
response = requests.get(url)
soup = BeautifulSoup(response.text, 'html.parser')

# Parse insider transactions table
table = soup.find('table', class_='tinytable')
# Extract: ticker, insider_name, transaction_type, shares, value, date
```

---

*End of Specification*
