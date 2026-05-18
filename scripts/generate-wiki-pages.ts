#!/usr/bin/env npx tsx
/**
 * Generate initial wiki pages from mnemon graph snapshot.
 * Runs locally without LLM API (uses clustering + markdown synthesis).
 */

import { createClient } from "@libsql/client";

const TURSO_URL = process.env.TURSO_DATABASE_URL;
const TURSO_TOKEN = process.env.TURSO_AUTH_TOKEN;

async function main() {
  if (!TURSO_URL || !TURSO_TOKEN) {
    console.error("Missing TURSO_DATABASE_URL or TURSO_AUTH_TOKEN");
    process.exit(1);
  }

  const db = createClient({ url: TURSO_URL, authToken: TURSO_TOKEN });

  const snapshotRes = await db.execute(
    "SELECT snapshot_json FROM mnemon_graph_snapshots ORDER BY created_at DESC LIMIT 1"
  );
  if (!snapshotRes.rows.length) {
    console.log("No snapshot found. Run: npx tsx scripts/sync-mnemon-to-hq.ts");
    return;
  }

  const snapshot = JSON.parse((snapshotRes.rows[0] as any).snapshot_json || "{}");
  const nodes = snapshot.nodes || [];

  // Group nodes by category for wiki generation
  const byCategory: Record<string, any[]> = {};
  for (const n of nodes) {
    const cat = n.category || "general";
    if (!byCategory[cat]) byCategory[cat] = [];
    byCategory[cat].push(n);
  }

  // Extract topics from content
  const topicKeywords = [
    "investment", "market", "stock", "trading", "portfolio", "risk",
    "crypto", "bitcoin", "oil", "gold", "AI", "tech", "software",
    "China", "US", "Singapore", "Japan", "Apple", "Tesla", "Nvidia",
    "Google", "Microsoft", "Amazon", "Meta", "backup", "database",
    "Docker", "cron", "API", "Vercel", "Next.js", "mnemon"
  ];
  const byTopic: Record<string, any[]> = {};
  for (const n of nodes) {
    const content = (n.content || "").toLowerCase();
    for (const kw of topicKeywords) {
      if (content.includes(kw.toLowerCase())) {
        if (!byTopic[kw]) byTopic[kw] = [];
        byTopic[kw].push(n);
      }
    }
  }

  // Create category-based wiki pages
  for (const [cat, catNodes] of Object.entries(byCategory)) {
    if (catNodes.length < 3) continue;
    const title = cat.charAt(0).toUpperCase() + cat.slice(1) + "s";
    const slug = cat + "s";

    let content = "# " + title + "\n\n";
    content += "## Overview\n\n";
    content += "This page contains " + catNodes.length + " **" + cat + "** insights from your knowledge graph.\n\n";
    content += "## Key Insights\n\n";
    for (const n of catNodes.slice(0, 15)) {
      content += "- " + (n.content || "").slice(0, 180) + ((n.content || "").length > 180 ? "..." : "") + "\n";
    }
    if (catNodes.length > 15) {
      content += "\n_... and " + (catNodes.length - 15) + " more_";
    }

    const insightIds = JSON.stringify(catNodes.map((n: any) => n.id));

    const existing = await db.execute("SELECT id FROM memoria_wiki_pages WHERE slug = ?", [slug]);
    if (existing.rows.length > 0) {
      await db.execute(
        'UPDATE memoria_wiki_pages SET title = ?, content = ?, source_insight_ids = ?, cluster_topic = ?, generated_at = datetime("now") WHERE slug = ?',
        [title, content, insightIds, cat, slug]
      );
    } else {
      await db.execute(
        "INSERT INTO memoria_wiki_pages (slug, title, content, source_insight_ids, cluster_topic) VALUES (?, ?, ?, ?, ?)",
        [slug, title, content, insightIds, cat]
      );
    }
    console.log("Created/updated category wiki:", slug, "(" + catNodes.length + " insights)");
  }

  // Create topic-based wiki pages
  for (const [topic, topicNodes] of Object.entries(byTopic)) {
    if (topicNodes.length < 3) continue;
    const title = topic.charAt(0).toUpperCase() + topic.slice(1);
    const slug = topic.toLowerCase().replace(/[^a-z0-9]+/g, "-");

    let content = "# " + title + "\n\n";
    content += "## Overview\n\n";
    content += "This page synthesizes " + topicNodes.length + " insights related to **" + title + "**.\n\n";
    content += "## Key Insights\n\n";
    for (const n of topicNodes.slice(0, 10)) {
      content += "- " + (n.content || "").slice(0, 180) + ((n.content || "").length > 180 ? "..." : "") + "\n";
    }
    if (topicNodes.length > 10) {
      content += "\n_... and " + (topicNodes.length - 10) + " more_";
    }

    const insightIds = JSON.stringify(topicNodes.map((n: any) => n.id));

    const existing = await db.execute("SELECT id FROM memoria_wiki_pages WHERE slug = ?", [slug]);
    if (existing.rows.length > 0) {
      await db.execute(
        'UPDATE memoria_wiki_pages SET title = ?, content = ?, source_insight_ids = ?, cluster_topic = ?, generated_at = datetime("now") WHERE slug = ?',
        [title, content, insightIds, topic, slug]
      );
    } else {
      await db.execute(
        "INSERT INTO memoria_wiki_pages (slug, title, content, source_insight_ids, cluster_topic) VALUES (?, ?, ?, ?, ?)",
        [slug, title, content, insightIds, topic]
      );
    }
    console.log("Created/updated topic wiki:", slug, "(" + topicNodes.length + " insights)");
  }

  const count = await db.execute("SELECT COUNT(*) as cnt FROM memoria_wiki_pages");
  console.log("\nTotal wiki pages:", count.rows[0].cnt);
  await db.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
