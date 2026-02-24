# Portfolio Feature Specification

## Overview
Unified `/stocks` page with three tabs: Research | Watchlist | Portfolio

## Database Schema (Turso)

```sql
-- Watchlist: staging area for stocks being monitored
CREATE TABLE IF NOT EXISTS watchlist (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticker TEXT NOT NULL UNIQUE,
  target_price REAL,
  notes TEXT,
  status TEXT DEFAULT 'watching' CHECK(status IN ('watching', 'accumulating', 'graduated')),
  added_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Portfolio holdings: single evolving portfolio
CREATE TABLE IF NOT EXISTS portfolio_holdings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticker TEXT NOT NULL UNIQUE,
  target_allocation REAL NOT NULL,
  cost_basis REAL,
  shares REAL,
  added_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Portfolio analysis reports (historical)
CREATE TABLE IF NOT EXISTS portfolio_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  content TEXT NOT NULL,
  summary TEXT,
  total_tickers INTEGER,
  created_at TEXT DEFAULT (datetime('now'))
);
```

## API Routes

### Watchlist
- `GET /api/watchlist` — List all watchlist items (with live prices)
- `POST /api/watchlist` — Add ticker to watchlist
- `PUT /api/watchlist/[id]` — Update watchlist item
- `DELETE /api/watchlist/[id]` — Remove from watchlist

### Portfolio Holdings
- `GET /api/portfolio/holdings` — List all holdings (with live prices)
- `POST /api/portfolio/holdings` — Add holding
- `PUT /api/portfolio/holdings/[id]` — Update holding (allocation, cost basis)
- `DELETE /api/portfolio/holdings/[id]` — Remove holding

### Portfolio Reports
- `GET /api/portfolio/reports` — List all portfolio reports
- `POST /api/portfolio/reports` — Generate new portfolio analysis

### Price Data
- `GET /api/stocks/price/[ticker]` — Fetch live price from Yahoo Finance

## UI Components

### Tab Navigation
- Tabs at top of /stocks page: Research | Watchlist | Portfolio
- URL structure: /stocks?tab=research (default) | /stocks?tab=watchlist | /stocks?tab=portfolio

### Research Tab (existing)
- Current functionality unchanged
- Add badge on ticker cards showing "In Watchlist" or "In Portfolio"

### Watchlist Tab
```
┌─────────────────────────────────────────────────────────┐
│ [+ Add to Watchlist]                                    │
├─────────────────────────────────────────────────────────┤
│ Ticker │ Price │ Target │ Gap % │ Status │ Notes │ Actions │
│ AAPL   │ $185  │ $170   │ -8.1% │ 👀     │ ...   │ ✏️ 🗑️ ➡️ │
│ MSFT   │ $420  │ $380   │ -9.5% │ 📈     │ ...   │ ✏️ 🗑️ ➡️ │
└─────────────────────────────────────────────────────────┘
```

- Status icons: 👀 watching, 📈 accumulating, ✅ graduated
- ➡️ button opens "Portfolio Inclusion Strategy" modal
- Click ticker → links to Sun Tzu report (if exists) or shows "Generate Report" option

### Portfolio Tab
```
┌─────────────────────────────────────────────────────────┐
│ Portfolio Holdings                    [Analyze Portfolio]│
├─────────────────────────────────────────────────────────┤
│ Allocation Bar: [████████ NXT 18% ████████ RMD 18% ...] │
├─────────────────────────────────────────────────────────┤
│ Ticker │ Allocation │ Price │ Cost Basis │ P/L │ Actions │
│ NXT    │ 18%        │ $121  │ $95        │ +27%│ ✏️ 🗑️   │
│ RMD    │ 18%        │ $271  │ -          │ -   │ ✏️ 🗑️   │
├─────────────────────────────────────────────────────────┤
│ Total  │ 94%        │       │            │     │ [+ Add] │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│ Latest Analysis                          Feb 8, 2026    │
├─────────────────────────────────────────────────────────┤
│ [Full portfolio report content]                         │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│ ▸ Historical Reports (3)                                │
└─────────────────────────────────────────────────────────┘
```

### Portfolio Inclusion Strategy Modal
Triggered when promoting from watchlist → portfolio

```
┌─────────────────────────────────────────────────────────┐
│ Portfolio Inclusion Strategy                        [X] │
├─────────────────────────────────────────────────────────┤
│ Adding: AAPL (Apple Inc.)                               │
│                                                         │
│ Current Portfolio Composition:                          │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ NXT   ████████████████████ 18%                      │ │
│ │ RMD   ████████████████████ 18%                      │ │
│ │ P8Z   ████████████ 12%                              │ │
│ │ AIY   ████████████ 12%                              │ │
│ │ ...                                                 │ │
│ │ Unallocated: 6%                                     │ │
│ └─────────────────────────────────────────────────────┘ │
│                                                         │
│ New Allocation for AAPL:                                │
│ ┌────────────────┐                                      │
│ │ [    5    ] %  │  [🤖 AI Suggest]                     │
│ └────────────────┘                                      │
│                                                         │
│ Cost Basis (optional): $___.__                          │
│ Shares (optional): ____                                 │
│                                                         │
│              [Cancel]  [Add to Portfolio]               │
└─────────────────────────────────────────────────────────┘
```

## Yahoo Finance Price Fetching

Use `yfinance` Python library via a helper script, or use a free API endpoint.

Option: Use `yahoo-finance2` npm package (simpler for Node.js):
```typescript
import yahooFinance from 'yahoo-finance2';
const quote = await yahooFinance.quote('AAPL');
// quote.regularMarketPrice, quote.currency, etc.
```

## Portfolio Analysis Skill

Location: `/root/openclaw/skills/portfolio-analysis/`

### Trigger
- "Analyze Portfolio" button in UI
- Chat command: "analyze my portfolio"

### Process
1. Fetch all holdings from `portfolio_holdings`
2. For each ticker:
   - Check if Sun Tzu report exists in `stock_reports`
   - If exists and < 30 days old → extract key metrics
   - If missing or stale → queue Sun Tzu report generation
3. Fetch live prices for all holdings
4. Generate portfolio analysis report using template:
   - Section I: The Troops (table of all holdings)
   - Section II: Scoring Matrix (ROIC, Tailwind, EPS, Technical, Balance Sheet)
   - Section III: Individual Assessments (each stock scored)
   - Section IV: Battle Formation (recommended allocations)
   - Section V: Portfolio Characteristics (weighted metrics)
   - Section VI: Master's Counsel (summary)
5. Store report in `portfolio_reports`
6. Return report content to UI

### AI Allocation Suggestion
When user clicks "AI Suggest" in the modal:
- Analyze the stock being added
- Consider current portfolio composition
- Suggest allocation % based on:
  - Stock's quality score
  - Existing sector/theme exposure
  - Diversification needs

## Implementation Order

1. Database schema migration
2. API routes (watchlist, holdings, reports, price)
3. Tab navigation component
4. Watchlist tab UI
5. Portfolio tab UI
6. Portfolio Inclusion Strategy modal
7. Portfolio analysis skill
8. Integration testing

## Files to Create/Modify

### New Files
- `src/app/api/watchlist/route.ts`
- `src/app/api/watchlist/[id]/route.ts`
- `src/app/api/portfolio/holdings/route.ts`
- `src/app/api/portfolio/holdings/[id]/route.ts`
- `src/app/api/portfolio/reports/route.ts`
- `src/app/api/stocks/price/[ticker]/route.ts`
- `src/components/StocksTabs.tsx`
- `src/components/WatchlistTab.tsx`
- `src/components/PortfolioTab.tsx`
- `src/components/PortfolioInclusionModal.tsx`
- `src/components/AllocationBar.tsx`
- `/root/openclaw/skills/portfolio-analysis/SKILL.md`
- `/root/openclaw/skills/portfolio-analysis/template.md`

### Modified Files
- `src/app/stocks/page.tsx` — Add tab navigation
- `src/lib/db.ts` — Add new table creation
- `src/lib/types.ts` — Add new types
- `src/components/StockFilters.tsx` — Add "In Watchlist/Portfolio" badges

## Dependencies to Add
```json
{
  "yahoo-finance2": "^2.11.0"
}
```
