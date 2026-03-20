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
// IBKR Trade History
// ============================================================================

export const ibkrImports = sqliteTable("ibkr_imports", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  filename: text("filename").notNull(),
  statementStart: text("statement_start"),
  statementEnd: text("statement_end"),
  tradeCount: integer("trade_count").default(0),
  dividendCount: integer("dividend_count").default(0),
  createdAt: text("created_at").default(sql`(datetime('now'))`),
});

export const ibkrTrades = sqliteTable("ibkr_trades", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  importId: integer("import_id").references(() => ibkrImports.id),
  tradeDate: text("trade_date").notNull(),
  settleDate: text("settle_date"),
  symbol: text("symbol").notNull(),
  description: text("description"),
  assetClass: text("asset_class"),
  action: text("action").notNull(),
  quantity: real("quantity").notNull(),
  price: real("price").notNull(),
  currency: text("currency").notNull().default("USD"),
  fxRate: real("fx_rate").default(1.0),
  proceeds: real("proceeds"),
  costBasis: real("cost_basis"),
  realizedPnl: real("realized_pnl"),
  commission: real("commission").default(0),
  fees: real("fees").default(0),
  createdAt: text("created_at").default(sql`(datetime('now'))`),
});

export const ibkrIncome = sqliteTable("ibkr_income", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  importId: integer("import_id").references(() => ibkrImports.id),
  date: text("date").notNull(),
  symbol: text("symbol").notNull(),
  description: text("description"),
  incomeType: text("income_type").notNull(),
  amount: real("amount").notNull(),
  currency: text("currency").notNull().default("USD"),
  fxRate: real("fx_rate").default(1.0),
  createdAt: text("created_at").default(sql`(datetime('now'))`),
});

export const ibkrFxRates = sqliteTable("ibkr_fx_rates", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  date: text("date").notNull(),
  fromCurrency: text("from_currency").notNull(),
  toCurrency: text("to_currency").notNull(),
  rate: real("rate").notNull(),
  createdAt: text("created_at").default(sql`(datetime('now'))`),
});

export const ibkrPositions = sqliteTable("ibkr_positions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  symbol: text("symbol").notNull().unique(),
  quantity: real("quantity").notNull(),
  avgCost: real("avg_cost").notNull(),
  currency: text("currency").notNull().default("USD"),
  totalCost: real("total_cost").notNull(),
  totalCostBase: real("total_cost_base").default(0),
  realizedPnl: real("realized_pnl").default(0),
  realizedPnlBase: real("realized_pnl_base").default(0),
  avgFxRate: real("avg_fx_rate").default(1),
  lastUpdated: text("last_updated").default(sql`(datetime('now'))`),
});

export const ibkrPortfolioMeta = sqliteTable("ibkr_portfolio_meta", {
  id: integer("id").primaryKey(),
  totalRealizedPnl: real("total_realized_pnl").default(0),
  totalRealizedPnlBase: real("total_realized_pnl_base").default(0),
  baseCurrency: text("base_currency").default("SGD"),
  updatedAt: text("updated_at").default(sql`(datetime('now'))`),
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

export type IbkrImport = typeof ibkrImports.$inferSelect;
export type NewIbkrImport = typeof ibkrImports.$inferInsert;

export type IbkrTrade = typeof ibkrTrades.$inferSelect;
export type NewIbkrTrade = typeof ibkrTrades.$inferInsert;

export type IbkrIncomeRecord = typeof ibkrIncome.$inferSelect;
export type NewIbkrIncomeRecord = typeof ibkrIncome.$inferInsert;

export type IbkrFxRate = typeof ibkrFxRates.$inferSelect;
export type NewIbkrFxRate = typeof ibkrFxRates.$inferInsert;

export type IbkrPosition = typeof ibkrPositions.$inferSelect;
export type NewIbkrPosition = typeof ibkrPositions.$inferInsert;

export type IbkrPortfolioMeta = typeof ibkrPortfolioMeta.$inferSelect;
export type NewIbkrPortfolioMeta = typeof ibkrPortfolioMeta.$inferInsert;

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

export const ACP_ACTIVITY_TYPES = [
  "job_completed",
  "job_failed",
  "buy",
  "offering_created",
  "offering_deleted",
  "heartbeat",
  "wallet_sync",
] as const;
export type AcpActivityType = (typeof ACP_ACTIVITY_TYPES)[number];

export const acpActivities = sqliteTable("acp_activities", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  type: text("type").notNull(), // job_completed, buy, offering_created, etc.
  jobId: text("job_id"), // ACP job ID if applicable
  offering: text("offering"), // offering name
  counterparty: text("counterparty"), // agent name or wallet
  amount: real("amount"), // USDC amount (positive = revenue, negative = expense)
  details: text("details"), // JSON with additional info
  outcome: text("outcome"), // success, failed, pending
  createdAt: text("created_at").default(sql`(datetime('now'))`),
});

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
  createdAt: text("created_at").default(sql`(datetime('now'))`),
  updatedAt: text("updated_at").default(sql`(datetime('now'))`),
});

export const acpWalletSnapshots = sqliteTable("acp_wallet_snapshots", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  usdcBalance: real("usdc_balance"),
  ethBalance: real("eth_balance"),
  cbbtcBalance: real("cbbtc_balance"),
  cbbtcValueUsd: real("cbbtc_value_usd"),
  totalValueUsd: real("total_value_usd"),
  snapshotAt: text("snapshot_at").default(sql`(datetime('now'))`),
});

export const acpEpochStats = sqliteTable("acp_epoch_stats", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  epochNumber: integer("epoch_number").notNull(),
  startDate: text("start_date"),
  endDate: text("end_date"),
  rank: integer("rank"),
  revenue: real("revenue"),
  jobsCompleted: integer("jobs_completed"),
  agentScore: real("agent_score"),
  estimatedReward: real("estimated_reward"),
  createdAt: text("created_at").default(sql`(datetime('now'))`),
});

export type AcpActivity = typeof acpActivities.$inferSelect;
export type NewAcpActivity = typeof acpActivities.$inferInsert;

export type AcpOffering = typeof acpOfferings.$inferSelect;
export type NewAcpOffering = typeof acpOfferings.$inferInsert;

export type AcpWalletSnapshot = typeof acpWalletSnapshots.$inferSelect;
export type NewAcpWalletSnapshot = typeof acpWalletSnapshots.$inferInsert;

export type AcpEpochStat = typeof acpEpochStats.$inferSelect;
export type NewAcpEpochStat = typeof acpEpochStats.$inferInsert;

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

export const ACP_EXPERIMENT_STATUSES = ["active", "paused", "retired"] as const;
export type AcpExperimentStatus = (typeof ACP_EXPERIMENT_STATUSES)[number];

export const ACP_PRICE_EXPERIMENT_STATUSES = ["measuring", "complete", "reverted"] as const;
export type AcpPriceExperimentStatus = (typeof ACP_PRICE_EXPERIMENT_STATUSES)[number];

export const acpOfferingExperiments = sqliteTable("acp_offering_experiments", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  offeringId: integer("offering_id").references(() => acpOfferings.id),
  name: text("name").notNull(),
  price: real("price").notNull(),
  description: text("description"),
  hypothesis: text("hypothesis"),
  status: text("status").default("active"),
  startDate: text("start_date").default(sql`(datetime('now'))`),
  endDate: text("end_date"),
  resultsSummary: text("results_summary"),
  controlOfferingId: integer("control_offering_id"),
  variantLabel: text("variant_label"),
  createdAt: text("created_at").default(sql`(datetime('now'))`),
  updatedAt: text("updated_at").default(sql`(datetime('now'))`),
});

export const acpOfferingMetrics = sqliteTable("acp_offering_metrics", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  offeringId: integer("offering_id")
    .notNull()
    .references(() => acpOfferings.id, { onDelete: "cascade" }),
  date: text("date").notNull(),
  jobsCount: integer("jobs_count").default(0),
  revenue: real("revenue").default(0),
  uniqueBuyers: integer("unique_buyers").default(0),
  views: integer("views").default(0),
  conversionRate: real("conversion_rate"),
  avgCompletionTimeMs: integer("avg_completion_time_ms"),
  failureCount: integer("failure_count").default(0),
  createdAt: text("created_at").default(sql`(datetime('now'))`),
});

export const acpPriceExperiments = sqliteTable("acp_price_experiments", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  offeringId: integer("offering_id")
    .notNull()
    .references(() => acpOfferings.id, { onDelete: "cascade" }),
  oldPrice: real("old_price").notNull(),
  newPrice: real("new_price").notNull(),
  changedAt: text("changed_at").default(sql`(datetime('now'))`),
  reason: text("reason"),
  jobsBefore7d: integer("jobs_before_7d"),
  jobsAfter7d: integer("jobs_after_7d"),
  revenueBefore7d: real("revenue_before_7d"),
  revenueAfter7d: real("revenue_after_7d"),
  revenueDelta: real("revenue_delta"),
  conversionBefore: real("conversion_before"),
  conversionAfter: real("conversion_after"),
  status: text("status").default("measuring"),
  evaluationDate: text("evaluation_date"),
  notes: text("notes"),
  createdAt: text("created_at").default(sql`(datetime('now'))`),
});

export const acpCompetitors = sqliteTable("acp_competitors", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  agentName: text("agent_name").notNull(),
  agentWallet: text("agent_wallet"),
  offeringName: text("offering_name").notNull(),
  price: real("price").notNull(),
  description: text("description"),
  category: text("category"),
  jobsCount: integer("jobs_count").default(0),
  totalRevenue: real("total_revenue"),
  isActive: integer("is_active").default(1),
  firstSeen: text("first_seen").default(sql`(datetime('now'))`),
  lastChecked: text("last_checked").default(sql`(datetime('now'))`),
  notes: text("notes"),
  tags: text("tags"),
  createdAt: text("created_at").default(sql`(datetime('now'))`),
  updatedAt: text("updated_at").default(sql`(datetime('now'))`),
});

export const acpCompetitorSnapshots = sqliteTable("acp_competitor_snapshots", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  competitorId: integer("competitor_id")
    .notNull()
    .references(() => acpCompetitors.id, { onDelete: "cascade" }),
  price: real("price").notNull(),
  jobsCount: integer("jobs_count"),
  description: text("description"),
  snapshotAt: text("snapshot_at").default(sql`(datetime('now'))`),
});

export type AcpOfferingExperiment = typeof acpOfferingExperiments.$inferSelect;
export type NewAcpOfferingExperiment = typeof acpOfferingExperiments.$inferInsert;

export type AcpOfferingMetric = typeof acpOfferingMetrics.$inferSelect;
export type NewAcpOfferingMetric = typeof acpOfferingMetrics.$inferInsert;

export type AcpPriceExperiment = typeof acpPriceExperiments.$inferSelect;
export type NewAcpPriceExperiment = typeof acpPriceExperiments.$inferInsert;

export type AcpCompetitor = typeof acpCompetitors.$inferSelect;
export type NewAcpCompetitor = typeof acpCompetitors.$inferInsert;

export type AcpCompetitorSnapshot = typeof acpCompetitorSnapshots.$inferSelect;
export type NewAcpCompetitorSnapshot = typeof acpCompetitorSnapshots.$inferInsert;

// ============================================================================
// ACP Operations Control Plane
// Central state management for ACP strategy, tasks, and decisions
// ============================================================================

export const ACP_PILLARS = ["quality", "replace", "build", "experiment", "distribute"] as const;
export type AcpPillar = (typeof ACP_PILLARS)[number];

export const ACP_TASK_STATUSES = ["pending", "in_progress", "done", "skipped"] as const;
export type AcpTaskStatus = (typeof ACP_TASK_STATUSES)[number];

export const ACP_DECISION_TYPES = ["pricing", "offering_change", "strategy_shift", "experiment"] as const;
export type AcpDecisionType = (typeof ACP_DECISION_TYPES)[number];

export const ACP_MARKETING_STATUSES = ["draft", "scheduled", "posted", "analyzed"] as const;
export type AcpMarketingStatus = (typeof ACP_MARKETING_STATUSES)[number];

export const ACP_STRATEGY_CATEGORIES = ["pricing", "offerings", "marketing", "experiments", "goals"] as const;
export type AcpStrategyCategory = (typeof ACP_STRATEGY_CATEGORIES)[number];

// Core state table (single row, updated frequently)
export const acpState = sqliteTable("acp_state", {
  id: integer("id").primaryKey(),
  currentPillar: text("current_pillar").notNull().default("quality"),
  currentEpoch: integer("current_epoch"),
  epochStart: text("epoch_start"),
  epochEnd: text("epoch_end"),
  jobsThisEpoch: integer("jobs_this_epoch").default(0),
  revenueThisEpoch: real("revenue_this_epoch").default(0),
  // Goals
  targetJobs: integer("target_jobs"),
  targetRevenue: real("target_revenue"),
  targetRank: integer("target_rank"),
  // Server status
  serverRunning: integer("server_running").default(1),
  serverPid: integer("server_pid"),
  lastHeartbeat: text("last_heartbeat"),
  updatedAt: text("updated_at").default(sql`(datetime('now'))`),
});

// Strategy parameters (key-value store for flexibility)
export const acpStrategy = sqliteTable("acp_strategy", {
  id: text("id").primaryKey(),
  category: text("category"),
  key: text("key").notNull(),
  value: text("value"),
  notes: text("notes"),
  updatedAt: text("updated_at").default(sql`(datetime('now'))`),
});

// Task queue (what needs to be done)
export const acpTasks = sqliteTable("acp_tasks", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  pillar: text("pillar").notNull(),
  priority: integer("priority").default(50),
  title: text("title").notNull(),
  description: text("description"),
  status: text("status").default("pending"),
  assignedAt: text("assigned_at"),
  completedAt: text("completed_at"),
  result: text("result"),
  createdAt: text("created_at").default(sql`(datetime('now'))`),
});

// Decision log (why decisions were made)
export const acpDecisions = sqliteTable("acp_decisions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  decisionType: text("decision_type"),
  offering: text("offering"),
  oldValue: text("old_value"),
  newValue: text("new_value"),
  reasoning: text("reasoning"),
  outcome: text("outcome"),
  createdAt: text("created_at").default(sql`(datetime('now'))`),
});

// Marketing campaigns
export const acpMarketing = sqliteTable("acp_marketing", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  channel: text("channel"),
  content: text("content").notNull(),
  targetOffering: text("target_offering"),
  status: text("status").default("draft"),
  scheduledAt: text("scheduled_at"),
  postedAt: text("posted_at"),
  tweetId: text("tweet_id"),
  engagementLikes: integer("engagement_likes").default(0),
  engagementRetweets: integer("engagement_retweets").default(0),
  engagementReplies: integer("engagement_replies").default(0),
  jobsAttributed: integer("jobs_attributed").default(0),
  revenueAttributed: real("revenue_attributed").default(0),
  createdAt: text("created_at").default(sql`(datetime('now'))`),
});

export type AcpState = typeof acpState.$inferSelect;
export type NewAcpState = typeof acpState.$inferInsert;

export type AcpStrategy = typeof acpStrategy.$inferSelect;
export type NewAcpStrategy = typeof acpStrategy.$inferInsert;

export type AcpTask = typeof acpTasks.$inferSelect;
export type NewAcpTask = typeof acpTasks.$inferInsert;

export type AcpDecision = typeof acpDecisions.$inferSelect;
export type NewAcpDecision = typeof acpDecisions.$inferInsert;

export type AcpMarketing = typeof acpMarketing.$inferSelect;
export type NewAcpMarketing = typeof acpMarketing.$inferInsert;

// ============================================================================
// ACP Jobs — Real-time job ledger
// ============================================================================

export const ACP_JOB_STATUSES = ["pending", "completed", "failed"] as const;
export type AcpJobStatus = (typeof ACP_JOB_STATUSES)[number];

export const acpJobs = sqliteTable("acp_jobs", {
  id: text("id").primaryKey(),                 // Virtuals job ID
  offering: text("offering").notNull(),
  buyer: text("buyer"),                        // Buyer wallet address
  amount: real("amount"),                      // USDC paid
  input: text("input"),                        // JSON string of job input
  status: text("status").default("pending"),   // pending/completed/failed
  result: text("result"),                      // JSON deliverable summary
  error: text("error"),
  startedAt: text("started_at"),
  completedAt: text("completed_at"),
  executionMs: integer("execution_ms"),
  createdAt: text("created_at").default(sql`(datetime('now'))`),
});

export type AcpJob = typeof acpJobs.$inferSelect;
export type NewAcpJob = typeof acpJobs.$inferInsert;

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
  createdAt: text("created_at").default(sql`(datetime('now'))`),
  updatedAt: text("updated_at").default(sql`(datetime('now'))`),
});

export type ClarityJournal = typeof clarityJournals.$inferSelect;
export type NewClarityJournal = typeof clarityJournals.$inferInsert;
