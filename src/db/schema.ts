import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

// ============================================================================
// Valid values for enum-like TEXT fields (validate in application code)
// ============================================================================

export const PROJECT_STATUSES = ["backlog", "in_progress", "blocked", "done"] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const PROJECT_PHASES = ["research", "plan", "build", "live"] as const;
export type ProjectPhase = (typeof PROJECT_PHASES)[number];

export const BUILD_STATUSES = ["pass", "fail", "unknown"] as const;
export type BuildStatus = (typeof BUILD_STATUSES)[number];

export const IDEA_STATUSES = ["new", "researching", "validated", "promoted", "rejected"] as const;
export type IdeaStatus = (typeof IDEA_STATUSES)[number];

export const EFFORT_ESTIMATES = ["tiny", "small", "medium", "large", "huge", "unknown"] as const;
export type EffortEstimate = (typeof EFFORT_ESTIMATES)[number];

export const POTENTIALS = ["low", "medium", "high", "moonshot", "unknown"] as const;
export type Potential = (typeof POTENTIALS)[number];

export const RESEARCH_JOB_STATUSES = ["pending", "processing", "complete", "failed"] as const;
export type ResearchJobStatus = (typeof RESEARCH_JOB_STATUSES)[number];

export const THEME_STOCK_STATUSES = ["watching", "accumulating", "holding"] as const;
export type ThemeStockStatus = (typeof THEME_STOCK_STATUSES)[number];

// ============================================================================
// Projects & Ideas
// ============================================================================

export const projects = sqliteTable("projects", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(),
  description: text("description").default(""),
  status: text("status").default("backlog"),
  phase: text("phase").default("build"),
  repoUrl: text("repo_url").default(""),
  deployUrl: text("deploy_url").default(""),
  testCount: integer("test_count").default(0),
  buildStatus: text("build_status").default("unknown"),
  lastDeployTime: text("last_deploy_time").default(""),
  targetAudience: text("target_audience").default(""),
  actionPlan: text("action_plan").default(""),
  planTech: text("plan_tech").default(""),
  planDistribution: text("plan_distribution").default(""),
  createdAt: text("created_at").default(sql`(datetime('now'))`),
  updatedAt: text("updated_at").default(sql`(datetime('now'))`),
});

export const ideas = sqliteTable("ideas", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull(),
  description: text("description").default(""),
  source: text("source").default(""),
  marketNotes: text("market_notes").default(""),
  effortEstimate: text("effort_estimate").default("unknown"),
  potential: text("potential").default("unknown"),
  status: text("status").default("new"),
  promotedToProjectId: integer("promoted_to_project_id").references(() => projects.id),
  tags: text("tags").default("[]"),
  createdAt: text("created_at").default(sql`(datetime('now'))`),
  updatedAt: text("updated_at").default(sql`(datetime('now'))`),
});

// ============================================================================
// Stock Research
// ============================================================================

// Report types: sun-tzu (single stock), thematic, comparative, portfolio, market
export const REPORT_TYPES = ["sun-tzu", "thematic", "comparative", "portfolio", "market"] as const;
export type ReportType = (typeof REPORT_TYPES)[number];

export const stockReports = sqliteTable("stock_reports", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ticker: text("ticker").notNull(), // For sun-tzu: actual ticker. For thematic: primary reference ticker (optional)
  slug: text("slug"), // URL identifier. kebab-case for thematic, ticker for sun-tzu
  title: text("title").notNull().default(""),
  content: text("content").notNull().default(""),
  reportType: text("report_type").notNull().default("sun-tzu"),
  companyName: text("company_name").default(""),
  relatedTickers: text("related_tickers").default(""),
  createdAt: text("created_at").default(sql`(datetime('now'))`),
});

export const researchPages = sqliteTable("research_pages", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  projectId: integer("project_id").notNull(),
  slug: text("slug").notNull(),
  title: text("title").notNull(),
  content: text("content").notNull(),
  sortOrder: integer("sort_order").default(0),
  createdAt: text("created_at").default(sql`(datetime('now'))`),
  updatedAt: text("updated_at").default(sql`(datetime('now'))`),
});

export const researchJobs = sqliteTable("research_jobs", {
  id: text("id").primaryKey(),
  ticker: text("ticker").notNull(),
  status: text("status").default("pending"),
  progress: integer("progress").default(0),
  errorMessage: text("error_message"),
  reportId: integer("report_id").references(() => stockReports.id),
  createdAt: text("created_at").default(sql`(datetime('now'))`),
  updatedAt: text("updated_at").default(sql`(datetime('now'))`),
});

// ============================================================================
// Portfolio
// ============================================================================

export const portfolioHoldings = sqliteTable("portfolio_holdings", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ticker: text("ticker").notNull().unique(),
  targetAllocation: real("target_allocation").notNull(),
  costBasis: real("cost_basis"),
  shares: real("shares"),
  addedAt: text("added_at").default(sql`(datetime('now'))`),
  updatedAt: text("updated_at").default(sql`(datetime('now'))`),
});

export const portfolioReports = sqliteTable("portfolio_reports", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  content: text("content").notNull(),
  summary: text("summary"),
  totalTickers: integer("total_tickers"),
  createdAt: text("created_at").default(sql`(datetime('now'))`),
});

// ============================================================================
// Investment Themes
// ============================================================================

export const themes = sqliteTable("themes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(),
  description: text("description").default(""),
  createdAt: text("created_at").default(sql`(datetime('now'))`),
});

export const themeStocks = sqliteTable("theme_stocks", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  themeId: integer("theme_id")
    .notNull()
    .references(() => themes.id, { onDelete: "cascade" }),
  ticker: text("ticker").notNull(),
  targetPrice: real("target_price"),
  status: text("status").default("watching"),
  notes: text("notes"),
  addedAt: text("added_at").default(sql`(datetime('now'))`),
});

// ============================================================================
// Telegram Bot
// ============================================================================

export const telegramUsers = sqliteTable("telegram_users", {
  telegramId: integer("telegram_id").primaryKey(),
  username: text("username"),
  firstName: text("first_name"),
  alertThemeMovers: integer("alert_theme_movers").default(1),
  alertSectorRotation: integer("alert_sector_rotation").default(1),
  alertThreshold: real("alert_threshold").default(5.0),
  createdAt: text("created_at").default(sql`(datetime('now'))`),
});

export const telegramPending = sqliteTable("telegram_pending", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  telegramId: integer("telegram_id").notNull(),
  chatId: integer("chat_id").notNull(),
  messageId: integer("message_id").notNull(),
  actionType: text("action_type").notNull(),
  payload: text("payload"),
  createdAt: text("created_at").default(sql`(datetime('now'))`),
});

// ============================================================================
// Type exports
// ============================================================================

export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;

export type Idea = typeof ideas.$inferSelect;
export type NewIdea = typeof ideas.$inferInsert;

export type StockReport = typeof stockReports.$inferSelect;
export type NewStockReport = typeof stockReports.$inferInsert;

export type ResearchPage = typeof researchPages.$inferSelect;
export type NewResearchPage = typeof researchPages.$inferInsert;

export type ResearchJob = typeof researchJobs.$inferSelect;
export type NewResearchJob = typeof researchJobs.$inferInsert;

export type PortfolioHolding = typeof portfolioHoldings.$inferSelect;
export type NewPortfolioHolding = typeof portfolioHoldings.$inferInsert;

export type PortfolioReport = typeof portfolioReports.$inferSelect;
export type NewPortfolioReport = typeof portfolioReports.$inferInsert;

export type Theme = typeof themes.$inferSelect;
export type NewTheme = typeof themes.$inferInsert;

export type ThemeStock = typeof themeStocks.$inferSelect;
export type NewThemeStock = typeof themeStocks.$inferInsert;

export type TelegramUser = typeof telegramUsers.$inferSelect;
export type NewTelegramUser = typeof telegramUsers.$inferInsert;

export type TelegramPendingAction = typeof telegramPending.$inferSelect;
export type NewTelegramPendingAction = typeof telegramPending.$inferInsert;

// ============================================================================
// Trade Journal
// ============================================================================

export const TRADE_JOURNAL_ACTIONS = ["buy", "sell", "trim", "add"] as const;
export type TradeJournalAction = (typeof TRADE_JOURNAL_ACTIONS)[number];

export const TRADE_JOURNAL_OUTCOMES = ["win", "loss", "breakeven", "open"] as const;
export type TradeJournalOutcome = (typeof TRADE_JOURNAL_OUTCOMES)[number];

export const tradeJournal = sqliteTable("trade_journal", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ticker: text("ticker").notNull(),
  action: text("action").notNull(),
  price: real("price").notNull(),
  shares: real("shares"),
  date: text("date").notNull(),
  thesis: text("thesis").notNull(),
  catalysts: text("catalysts"),
  invalidators: text("invalidators"),
  outcome: text("outcome").default("open"),
  exitPrice: real("exit_price"),
  exitDate: text("exit_date"),
  lessonsLearned: text("lessons_learned"),
  emotionalState: text("emotional_state"),
  tags: text("tags").default("[]"),
  createdAt: text("created_at").default(sql`(datetime('now'))`),
  updatedAt: text("updated_at").default(sql`(datetime('now'))`),
});

export type TradeJournalEntry = typeof tradeJournal.$inferSelect;
export type NewTradeJournalEntry = typeof tradeJournal.$inferInsert;

// ============================================================================
// Gold Analysis
// ============================================================================

export const goldAnalysis = sqliteTable("gold_analysis", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  currentPrice: real("current_price"),
  ath: real("ath"),
  athDate: text("ath_date"),
  keyLevels: text("key_levels"), // JSON: [{ level: number, significance: string }]
  scenarios: text("scenarios"), // JSON: [{ name: string, probability: number, priceRange: string, description: string }]
  thesisNotes: text("thesis_notes"), // Markdown — qualitative narrative only
  cyclePhase: integer("cycle_phase").default(3), // 1=Accumulation, 2=Markup, 3=Acceleration, 4=Mania
  catalysts: text("catalysts"), // JSON: { bull: string[], bear: string[] }
  updatedAt: text("updated_at").default(sql`(datetime('now'))`),
});

export const goldFlows = sqliteTable("gold_flows", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  date: text("date").notNull(),
  gldSharesOutstanding: real("gld_shares_outstanding"),
  gldNav: real("gld_nav"),
  estimatedFlowUsd: real("estimated_flow_usd"), // calculated
  globalEtfFlowUsd: real("global_etf_flow_usd"), // manual/scraped
  centralBankTonnes: real("central_bank_tonnes"), // manual/scraped quarterly
  source: text("source"), // 'yahoo' | 'wgc' | 'manual'
  createdAt: text("created_at").default(sql`(datetime('now'))`),
});

export type GoldAnalysis = typeof goldAnalysis.$inferSelect;
export type NewGoldAnalysis = typeof goldAnalysis.$inferInsert;

export type GoldFlow = typeof goldFlows.$inferSelect;
export type NewGoldFlow = typeof goldFlows.$inferInsert;

// ============================================================================
// Macro Insights (AI-generated)
// ============================================================================

export const macroInsights = sqliteTable("macro_insights", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  insights: text("insights").notNull(), // Markdown content
  indicatorSnapshot: text("indicator_snapshot"), // JSON of indicator values at generation time
  generatedAt: text("generated_at").default(sql`(datetime('now'))`),
});

export type MacroInsight = typeof macroInsights.$inferSelect;
export type NewMacroInsight = typeof macroInsights.$inferInsert;

// ============================================================================
// Stock Scans
// ============================================================================

export const SCAN_TYPES = ["structural-inflection", "sun-tzu-sgx", "unified"] as const;
export type ScanType = (typeof SCAN_TYPES)[number];

export const stockScans = sqliteTable("stock_scans", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  scanType: text("scan_type").notNull(),
  scannedAt: text("scanned_at").default(sql`(datetime('now'))`),
  results: text("results").notNull(), // JSON array of stocks
  summary: text("summary"), // JSON counts by tier
  stockCount: integer("stock_count").default(0),
});

export type StockScan = typeof stockScans.$inferSelect;
export type NewStockScan = typeof stockScans.$inferInsert;

// ============================================================================
// Scanner Universe - Tickers to scan
// ============================================================================

export const SCANNER_MARKETS = ["US", "SGX", "HK"] as const;
export type ScannerMarket = (typeof SCANNER_MARKETS)[number];

export const SCANNER_SOURCES = ["curated", "discovered", "user"] as const;
export type ScannerSource = (typeof SCANNER_SOURCES)[number];

export const scannerUniverse = sqliteTable("scanner_universe", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ticker: text("ticker").notNull().unique(),
  market: text("market").notNull(), // US, SGX, HK
  name: text("name"), // Company name (optional, populated on first scan)
  sector: text("sector"), // Optional sector/industry
  source: text("source").default("curated"), // curated, discovered, user
  enabled: integer("enabled", { mode: "boolean" }).default(true),
  notes: text("notes"), // Optional notes about why this ticker is included
  createdAt: text("created_at").default(sql`(datetime('now'))`),
  updatedAt: text("updated_at").default(sql`(datetime('now'))`),
});

export type ScannerTicker = typeof scannerUniverse.$inferSelect;
export type NewScannerTicker = typeof scannerUniverse.$inferInsert;

// ============================================================================
// Analyst Tracker
// ============================================================================

export const ANALYST_CALL_ACTIONS = ["buy", "sell", "hold", "upgrade", "downgrade"] as const;
export type AnalystCallAction = (typeof ANALYST_CALL_ACTIONS)[number];

export const ANALYST_CALL_OUTCOMES = ["hit", "miss", "pending"] as const;
export type AnalystCallOutcome = (typeof ANALYST_CALL_OUTCOMES)[number];

export const analysts = sqliteTable("analysts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  firm: text("firm").notNull(),
  specialty: text("specialty"), // e.g., "semiconductors", "financials"
  successRate: real("success_rate"), // e.g., 0.88 for 88%
  avgReturn: real("avg_return"), // average return on their picks
  notes: text("notes"),
  createdAt: text("created_at").default(sql`(datetime('now'))`),
  updatedAt: text("updated_at").default(sql`(datetime('now'))`),
});

export const analystCalls = sqliteTable("analyst_calls", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  analystId: integer("analyst_id").references(() => analysts.id),
  ticker: text("ticker").notNull(),
  action: text("action").notNull(), // 'buy', 'sell', 'hold', 'upgrade', 'downgrade'
  priceTarget: real("price_target"),
  priceAtCall: real("price_at_call"),
  currentPrice: real("current_price"),
  callDate: text("call_date").notNull(),
  notes: text("notes"),
  outcome: text("outcome"), // 'hit', 'miss', 'pending'
  createdAt: text("created_at").default(sql`(datetime('now'))`),
});

export type Analyst = typeof analysts.$inferSelect;
export type NewAnalyst = typeof analysts.$inferInsert;

export type AnalystCall = typeof analystCalls.$inferSelect;
export type NewAnalystCall = typeof analystCalls.$inferInsert;

// ============================================================================
// ACP (Agent Commerce Protocol)
// ============================================================================

export const acpOfferings = sqliteTable("acp_offerings", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(),
  description: text("description"),
  price: real("price").notNull(),
  category: text("category"), // fortune, market_data, utility
  isActive: integer("is_active").default(1),
  jobCount: integer("job_count").default(0),
  totalRevenue: real("total_revenue").default(0),
  lastJobAt: text("last_job_at"),
  // HQ as source of truth - new columns
  handlerPath: text("handler_path"), // e.g., 'btc_signal' (directory name in offerings/)
  requirements: text("requirements"), // JSON string of input requirements
  deliverable: text("deliverable"), // What the offering returns
  requiredFunds: integer("required_funds").default(0), // Whether funds are required
  listedOnAcp: integer("listed_on_acp").default(0), // Synced from actual ACP marketplace
  doNotRelist: integer("do_not_relist").default(0), // Set to 1 when manually delisted; prevents auto-relist
  createdAt: text("created_at").default(sql`(datetime('now'))`),
  updatedAt: text("updated_at").default(sql`(datetime('now'))`),
});

export type AcpOffering = typeof acpOfferings.$inferSelect;
export type NewAcpOffering = typeof acpOfferings.$inferInsert;

// ============================================================================
// Gavekal Historical Price Data
// ============================================================================

export const gavekalPrices = sqliteTable("gavekal_prices", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  symbol: text("symbol").notNull(), // ^GSPC, CL=F, GC=F, IEF + _M historical monthly variants
  date: text("date").notNull(), // YYYY-MM-DD
  close: real("close").notNull(),
  createdAt: text("created_at").default(sql`(datetime('now'))`),
});

export type GavekalPrice = typeof gavekalPrices.$inferSelect;
export type NewGavekalPrice = typeof gavekalPrices.$inferInsert;

// ============================================================================
// Gavekal Historical Snapshot — materialized monthly regime/ratio view.
// Precomputed from the four `_M`-suffixed monthly series in gavekal_prices,
// so the cold path doesn't have to recompute the 84-month MA + regime
// classification on every cache miss. Past months are immutable.
// ============================================================================

export const gavekalHistoricalSnapshot = sqliteTable(
  "gavekal_historical_snapshot",
  {
    date: text("date").primaryKey(), // YYYY-MM-DD, first of month
    energyRatio: real("energy_ratio").notNull(), // S&P 500 / WTI
    currencyRatio: real("currency_ratio").notNull(), // 10y UST / Gold
    energyMa: real("energy_ma"), // 84-month MA, NULL during warmup
    currencyMa: real("currency_ma"), // 84-month MA, NULL during warmup
    regime: text("regime").notNull(), // "Inflationary Boom" | etc.
    createdAt: text("created_at").default(sql`(datetime('now'))`),
  },
);

export type GavekalHistoricalSnapshotRow =
  typeof gavekalHistoricalSnapshot.$inferSelect;
export type NewGavekalHistoricalSnapshotRow =
  typeof gavekalHistoricalSnapshot.$inferInsert;

// ============================================================================
// Stock Daily Prices — materialized cache for theme performance.
// One row per (ticker, date). Past closes are immutable so this is an
// append-only store. Used by `fetchThemePerformanceAll()` to skip the
// per-ticker Yahoo chart() calls on warm cache misses.
// ============================================================================

export const stockPricesDaily = sqliteTable("stock_prices_daily", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ticker: text("ticker").notNull(),
  date: text("date").notNull(), // YYYY-MM-DD
  close: real("close").notNull(),
  createdAt: text("created_at").default(sql`(datetime('now'))`),
});

export type StockPriceDailyRow = typeof stockPricesDaily.$inferSelect;
export type NewStockPriceDailyRow = typeof stockPricesDaily.$inferInsert;

// ============================================================================
// Market Data Cache (Stale-While-Revalidate Pattern)
// ============================================================================

export const marketCache = sqliteTable("market_cache", {
  key: text("key").primaryKey(),
  data: text("data").notNull(), // JSON stringified data
  updatedAt: text("updated_at").default(sql`(datetime('now'))`),
});

export type MarketCacheEntry = typeof marketCache.$inferSelect;
export type NewMarketCacheEntry = typeof marketCache.$inferInsert;

// ============================================================================
// Market Indicators - Congress Trades
// ============================================================================

export const congressTrades = sqliteTable("congress_trades", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  memberName: text("member_name").notNull(),
  party: text("party"), // R, D, I
  state: text("state"),
  chamber: text("chamber"), // house, senate
  ticker: text("ticker").notNull(),
  transactionType: text("transaction_type").notNull(), // purchase, sale
  amountRange: text("amount_range"), // e.g., "$1,001 - $15,000"
  transactionDate: text("transaction_date").notNull(),
  filedDate: text("filed_date"),
  sourceId: text("source_id"), // External ID to prevent duplicates
  createdAt: text("created_at").default(sql`(datetime('now'))`),
});

export type CongressTrade = typeof congressTrades.$inferSelect;
export type NewCongressTrade = typeof congressTrades.$inferInsert;

// ============================================================================
// Market Indicators - Insider Trades (SEC Form 4)
// ============================================================================

export const insiderTrades = sqliteTable("insider_trades", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  company: text("company").notNull(),
  ticker: text("ticker").notNull(),
  insiderName: text("insider_name").notNull(),
  title: text("title"), // CEO, CFO, Director, etc.
  transactionType: text("transaction_type").notNull(), // buy, sell, exercise
  shares: real("shares"),
  price: real("price"),
  value: real("value"),
  transactionDate: text("transaction_date").notNull(),
  filedDate: text("filed_date"),
  sourceId: text("source_id"), // External ID to prevent duplicates
  createdAt: text("created_at").default(sql`(datetime('now'))`),
});

export type InsiderTrade = typeof insiderTrades.$inferSelect;
export type NewInsiderTrade = typeof insiderTrades.$inferInsert;

// ============================================================================
// Market Indicators - Dark Pool Data (FINRA ATS)
// ============================================================================

export const darkpoolData = sqliteTable("darkpool_data", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  weekEnding: text("week_ending").notNull(),
  ticker: text("ticker"), // NULL for aggregate data
  atsVolume: real("ats_volume").notNull(),
  totalVolume: real("total_volume"),
  atsPercent: real("ats_percent"),
  issueType: text("issue_type"), // equity, etf, etc.
  createdAt: text("created_at").default(sql`(datetime('now'))`),
});

export type DarkpoolData = typeof darkpoolData.$inferSelect;
export type NewDarkpoolData = typeof darkpoolData.$inferInsert;

// ============================================================================
// Market Indicators - COMEX Silver Warehouse Stocks
// ============================================================================

export const silverStocks = sqliteTable("silver_stocks", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  reportDate: text("report_date").notNull(), // Date CME published the report
  activityDate: text("activity_date").notNull().unique(), // Date the data is for
  registeredOz: real("registered_oz").notNull(), // Deliverable silver (key metric)
  eligibleOz: real("eligible_oz").notNull(), // Stored but not deliverable
  totalOz: real("total_oz").notNull(), // Combined total
  createdAt: text("created_at").default(sql`(datetime('now'))`),
});

export type SilverStock = typeof silverStocks.$inferSelect;
export type NewSilverStock = typeof silverStocks.$inferInsert;

// ============================================================================
// Market Reference Data
// ============================================================================

export const marketReference = sqliteTable("market_reference", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  symbol: text("symbol").notNull().unique(), // e.g., "GOLD", "BTC", "SPX", "VIX", "OIL"
  name: text("name").notNull(), // e.g., "Gold", "Bitcoin", "S&P 500"
  yahooTicker: text("yahoo_ticker"), // e.g., "GC=F", "BTC-USD", "^GSPC"
  athPrice: real("ath_price"), // all-time high price
  athDate: text("ath_date"), // when ATH was hit
  currentPrice: real("current_price"), // last fetched price
  keyThresholds: text("key_thresholds"), // JSON: { buy_zone: number, sell_zone: number, ... }
  notes: text("notes"), // context like "VIX >40 = fear, >50 = panic"
  updatedAt: text("updated_at").default(sql`(datetime('now'))`),
});

export type MarketReference = typeof marketReference.$inferSelect;
export type NewMarketReference = typeof marketReference.$inferInsert;

// ============================================================================
// Memoria — Knowledge Vault
// ============================================================================

export const MEMORIA_SOURCE_TYPES = ["book", "article", "podcast", "conversation", "thought", "tweet", "video"] as const;
export type MemoriaSourceType = (typeof MEMORIA_SOURCE_TYPES)[number];

export const memoriaEntries = sqliteTable("memoria_entries", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  content: text("content").notNull(),
  sourceType: text("source_type").notNull(),
  sourceTitle: text("source_title"),
  sourceAuthor: text("source_author"),
  sourceUrl: text("source_url"),
  sourceLocation: text("source_location"),
  myNote: text("my_note"),
  aiTags: text("ai_tags"),
  aiSummary: text("ai_summary"),
  isFavorite: integer("is_favorite").default(0),
  isArchived: integer("is_archived").default(0),
  createdAt: text("created_at").default(sql`(datetime('now'))`),
  updatedAt: text("updated_at").default(sql`(datetime('now'))`),
  capturedAt: text("captured_at"),
  lastSurfacedAt: text("last_surfaced_at"),
});

export const memoriaTags = sqliteTable("memoria_tags", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(),
  color: text("color"),
  createdAt: text("created_at").default(sql`(datetime('now'))`),
});

export const memoriaEntryTags = sqliteTable("memoria_entry_tags", {
  entryId: integer("entry_id").notNull().references(() => memoriaEntries.id, { onDelete: "cascade" }),
  tagId: integer("tag_id").notNull().references(() => memoriaTags.id, { onDelete: "cascade" }),
});

export const memoriaInsights = sqliteTable("memoria_insights", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  insightType: text("insight_type"),
  title: text("title"),
  content: text("content").notNull(),
  entryIds: text("entry_ids"),
  generatedAt: text("generated_at").default(sql`(datetime('now'))`),
});

export type MemoriaEntry = typeof memoriaEntries.$inferSelect;
export type NewMemoriaEntry = typeof memoriaEntries.$inferInsert;

export type MemoriaTag = typeof memoriaTags.$inferSelect;
export type NewMemoriaTag = typeof memoriaTags.$inferInsert;

export type MemoriaEntryTag = typeof memoriaEntryTags.$inferSelect;
export type NewMemoriaEntryTag = typeof memoriaEntryTags.$inferInsert;

export type MemoriaInsight = typeof memoriaInsights.$inferSelect;
export type NewMemoriaInsight = typeof memoriaInsights.$inferInsert;

// ============================================================================
// ACP Experimentation — Track A/B tests, metrics, price changes, competitors
// ============================================================================

// Core state table (single row, updated frequently)

// Strategy parameters (key-value store for flexibility)

// Task queue (what needs to be done)

// Decision log (why decisions were made)

// Marketing campaigns

// ============================================================================
// Thesis Engine — Generic asset thesis framework
// ============================================================================

export const THESIS_STATUSES = ["active", "suspended", "invalidated"] as const;
export type ThesisStatus = (typeof THESIS_STATUSES)[number];

export const thesisConfigs = sqliteTable("thesis_configs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  asset: text("asset").notNull().unique(), // gold, oil, btc, silver
  name: text("name").notNull(),
  status: text("status").default("active"), // active, suspended, invalidated
  signalDefinitions: text("signal_definitions"), // JSON: signal overrides
  entryConditions: text("entry_conditions"), // JSON: pre-commitment entry rules
  thesisChangeConditions: text("thesis_change_conditions"), // JSON: invalidation rules
  reviewTriggers: text("review_triggers"), // JSON: review trigger rules
  notes: text("notes"),
  createdAt: text("created_at").default(sql`(datetime('now'))`),
  updatedAt: text("updated_at").default(sql`(datetime('now'))`),
});

export const thesisSignals = sqliteTable("thesis_signals", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  asset: text("asset").notNull(),
  signalData: text("signal_data").notNull(), // JSON: all evaluated signals
  overallScore: integer("overall_score").notNull(), // 0-100
  entryMet: integer("entry_met").default(0), // boolean
  changeMet: integer("change_met").default(0), // boolean
  reviewMet: integer("review_met").default(0), // boolean
  snapshotAt: text("snapshot_at").default(sql`(datetime('now'))`),
});

export const THESIS_DECISION_TYPES = ["entry", "add", "trim", "exit", "hold", "review"] as const;
export type ThesisDecisionType = (typeof THESIS_DECISION_TYPES)[number];

export const thesisDecisionLog = sqliteTable("thesis_decision_log", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  asset: text("asset").notNull(),
  decisionType: text("decision_type").notNull(), // entry, add, trim, exit, hold, review
  reasoning: text("reasoning"),
  signalSnapshotId: integer("signal_snapshot_id").references(() => thesisSignals.id),
  priceAtDecision: real("price_at_decision"),
  quantity: text("quantity"), // e.g., "2% GLD", "5 shares"
  emotionalState: text("emotional_state"), // calm, anxious, excited, fearful
  tradeJournalId: integer("trade_journal_id").references(() => tradeJournal.id),
  outcome: text("outcome"),
  createdAt: text("created_at").default(sql`(datetime('now'))`),
});

// ============================================================================
// CFTC Commitment of Traders
// ============================================================================

export const cftcPositions = sqliteTable("cftc_positions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  reportDate: text("report_date").notNull(),
  commodity: text("commodity").notNull(), // gold, silver, crude_oil, sp500
  noncommercialLong: real("noncommercial_long"),
  noncommercialShort: real("noncommercial_short"),
  netSpeculative: real("net_speculative"), // long - short
  commercialLong: real("commercial_long"),
  commercialShort: real("commercial_short"),
  openInterest: real("open_interest"),
  source: text("source").default("cftc"),
  createdAt: text("created_at").default(sql`(datetime('now'))`),
});

export type ThesisConfig = typeof thesisConfigs.$inferSelect;
export type NewThesisConfig = typeof thesisConfigs.$inferInsert;

export type ThesisSignal = typeof thesisSignals.$inferSelect;
export type NewThesisSignal = typeof thesisSignals.$inferInsert;

export type ThesisDecisionLogEntry = typeof thesisDecisionLog.$inferSelect;
export type NewThesisDecisionLogEntry = typeof thesisDecisionLog.$inferInsert;

export type CftcPosition = typeof cftcPositions.$inferSelect;
export type NewCftcPosition = typeof cftcPositions.$inferInsert;

// ============================================================================
// Investment Clarity Journal
// ============================================================================

export const CLARITY_DECISIONS = ["buy", "sell", "hold", "wait"] as const;
export type ClarityDecision = (typeof CLARITY_DECISIONS)[number];

export const clarityJournals = sqliteTable("clarity_journals", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  asset: text("asset").notNull().default(""),
  decision: text("decision"), // buy, sell, hold, wait, null
  data: text("data").notNull().default("{}"), // JSON with all field values
  holdingId: integer("holding_id").references(() => portfolioHoldings.id, { onDelete: "set null" }), // Link to portfolio holding
  createdAt: text("created_at").default(sql`(datetime('now'))`),
  updatedAt: text("updated_at").default(sql`(datetime('now'))`),
});

export type ClarityJournal = typeof clarityJournals.$inferSelect;
export type NewClarityJournal = typeof clarityJournals.$inferInsert;
