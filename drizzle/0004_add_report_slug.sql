-- Add slug column for report URL routing
-- For sun-tzu reports: slug = ticker (e.g., "AAPL", "TSLA")
-- For thematic reports: slug = descriptive kebab-case (e.g., "china-robotics-ai-2026")
ALTER TABLE stock_reports ADD COLUMN slug TEXT;

-- Backfill: set slug = ticker for all existing reports
UPDATE stock_reports SET slug = ticker WHERE slug IS NULL;
