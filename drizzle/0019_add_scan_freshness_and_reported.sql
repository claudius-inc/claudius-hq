-- Two gaps found reviewing migration 0018's consumers.
--
-- 1. `last_good_scan_at`
--    watchlist-orchestrator's "preserve on failure" branch keeps a previously
--    healthy row intact when a fetch fails — including data_quality='ok' — and
--    bumps `computed_at` to record the attempt. `computed_at` is therefore NOT
--    a freshness signal: a permanently failing ticker (delisting, Yahoo rename)
--    stays 'ok' forever with frozen scores. Under the old delta ranking a
--    frozen row scored delta 0 and never surfaced; the new ranking is
--    `ORDER BY technical_score DESC`, so a row frozen in a strong state ranks
--    at the TOP and reappears every time its cooldown expires. This column is
--    written only on a genuinely successful fetch, so the report can gate on
--    real staleness.
--
-- 2. `momentum_report_picks.reported`
--    0018 stored only the LIMIT-10 picks, which were already filtered by the
--    momentum_score band. The band cannot be re-derived out-of-sample from data
--    pre-filtered by that band. The table now stores every qualified candidate
--    with reported=1 for the ones actually sent, matching how
--    crypto_screen_picks already works.

ALTER TABLE `ticker_metrics` ADD COLUMN `last_good_scan_at` text;

ALTER TABLE `momentum_report_picks` ADD COLUMN `reported` integer DEFAULT 0;
