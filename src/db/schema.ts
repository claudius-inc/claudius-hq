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

export const WATCHLIST_STATUSES = ["watching", "accumulating", "graduated"] as const;
export type WatchlistStatus = (typeof WATCHLIST_STATUSES)[number];

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

export const stockReports = sqliteTable("stock_reports", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ticker: text("ticker").notNull(),
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
// Watchlist & Portfolio
// ============================================================================

export const watchlist = sqliteTable("watchlist", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ticker: text("ticker").notNull().unique(),
  targetPrice: real("target_price"),
  notes: text("notes"),
  status: text("status").default("watching"),
  addedAt: text("added_at").default(sql`(datetime('now'))`),
  updatedAt: text("updated_at").default(sql`(datetime('now'))`),
});

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
// Stock Alerts
// ============================================================================

export const ALERT_STATUSES = ["watching", "triggered", "paused"] as const;
export type AlertStatus = (typeof ALERT_STATUSES)[number];

export const stockAlerts = sqliteTable("stock_alerts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ticker: text("ticker").notNull(),
  accumulateLow: real("accumulate_low"),
  accumulateHigh: real("accumulate_high"),
  strongBuyLow: real("strong_buy_low"),
  strongBuyHigh: real("strong_buy_high"),
  status: text("status").default("watching"),
  lastTriggered: text("last_triggered"),
  notes: text("notes"),
  createdAt: text("created_at").default(sql`(datetime('now'))`),
  updatedAt: text("updated_at").default(sql`(datetime('now'))`),
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

export type WatchlistItem = typeof watchlist.$inferSelect;
export type NewWatchlistItem = typeof watchlist.$inferInsert;

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

export type StockAlert = typeof stockAlerts.$inferSelect;
export type NewStockAlert = typeof stockAlerts.$inferInsert;

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
  thesisNotes: text("thesis_notes"), // Markdown
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
