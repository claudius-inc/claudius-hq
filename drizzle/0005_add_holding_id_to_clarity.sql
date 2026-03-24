-- Add holding_id to clarity_journals for linking journal entries to holdings
ALTER TABLE clarity_journals ADD COLUMN holding_id INTEGER REFERENCES portfolio_holdings(id) ON DELETE SET NULL;
