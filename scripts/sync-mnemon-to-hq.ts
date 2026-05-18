#!/usr/bin/env npx tsx
/**
 * Sync mnemon knowledge graph to HQ Turso DB.
 *
 * Run via cron on the VPS (e.g. hourly):
 *   0 * * * * cd /root/.openclaw/workspace/projects/claudius-hq && npx tsx scripts/sync-mnemon-to-hq.ts >> /var/log/mnemon-sync.log 2>&1
 */

import { createClient } from "@libsql/client";
import { execSync } from "child_process";

const MNEMON_DB = process.env.MNEMON_DB || "/root/.mnemon/data/default/mnemon.db";
const TURSO_URL = process.env.TURSO_DATABASE_URL;
const TURSO_TOKEN = process.env.TURSO_AUTH_TOKEN;

function sqliteQuery(dbPath: string, sql: string): any[] {
  const output = execSync(`sqlite3 "${dbPath}" "${sql.replace(/"/g, '""')}"`, {
    encoding: "utf8",
    maxBuffer: 50 * 1024 * 1024,
  });
  return output
    .trim()
    .split("\n")
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line));
}

async function main() {
  if (!TURSO_URL || !TURSO_TOKEN) {
    console.error("Missing TURSO_DATABASE_URL or TURSO_AUTH_TOKEN env vars");
    process.exit(1);
  }

  console.log(`[${new Date().toISOString()}] Starting mnemon sync...`);

  try {
    // Fetch all non-deleted insights as JSON lines
    const insights = sqliteQuery(
      MNEMON_DB,
      `SELECT json_object(
        'id', id,
        'content', content,
        'category', COALESCE(category, 'general'),
        'importance', COALESCE(importance, 3),
        'entities', COALESCE(entities, '[]'),
        'tags', COALESCE(tags, '[]'),
        'source', COALESCE(source, 'user'),
        'createdAt', created_at
      ) FROM insights WHERE deleted_at IS NULL`
    );

    // Fetch all edges as JSON lines
    const edges = sqliteQuery(
      MNEMON_DB,
      `SELECT json_object(
        'source', source_id,
        'target', target_id,
        'type', edge_type,
        'weight', COALESCE(weight, 1.0),
        'metadata', COALESCE(metadata, '{}')
      ) FROM edges`
    );

    // Parse JSON string fields in insights
    const nodes = insights.map((row: any) => ({
      ...row,
      entities: JSON.parse(row.entities || "[]"),
      tags: JSON.parse(row.tags || "[]"),
    }));

    const snapshot = {
      nodes,
      edges,
      meta: {
        nodeCount: nodes.length,
        edgeCount: edges.length,
        generatedAt: new Date().toISOString(),
        mnemonDbPath: MNEMON_DB,
      },
    };

    // Connect to Turso and insert snapshot
    const client = createClient({
      url: TURSO_URL,
      authToken: TURSO_TOKEN,
    });

    const snapshotJson = JSON.stringify(snapshot);

    await client.execute({
      sql: `INSERT INTO mnemon_graph_snapshots (snapshot_json, node_count, edge_count) VALUES (?, ?, ?)`,
      args: [snapshotJson, nodes.length, edges.length],
    });

    await client.close();

    console.log(
      `[${new Date().toISOString()}] Sync complete: ${nodes.length} nodes, ${edges.length} edges`
    );
  } catch (err) {
    console.error(`[${new Date().toISOString()}] Sync failed:`, err);
    process.exit(1);
  }
}

main();
