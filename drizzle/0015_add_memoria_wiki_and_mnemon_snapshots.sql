-- ============================================================================
-- Migration 0015: Add Memoria wiki pages and mnemon graph snapshot tables.
--
-- memoria_wiki_pages    — Generated narrative pages from mnemon insight clusters
-- mnemon_graph_snapshots — Cached knowledge graph dumps synced from VPS mnemon
-- ============================================================================

CREATE TABLE memoria_wiki_pages (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    slug            TEXT NOT NULL UNIQUE,
    title           TEXT NOT NULL,
    content         TEXT NOT NULL DEFAULT '',
    source_insight_ids TEXT DEFAULT '[]',
    cluster_topic   TEXT,
    generated_at    TEXT DEFAULT (datetime('now')),
    updated_at      TEXT DEFAULT (datetime('now'))
);

CREATE TABLE mnemon_graph_snapshots (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    snapshot_json   TEXT NOT NULL,
    node_count      INTEGER DEFAULT 0,
    edge_count      INTEGER DEFAULT 0,
    created_at      TEXT DEFAULT (datetime('now'))
);
