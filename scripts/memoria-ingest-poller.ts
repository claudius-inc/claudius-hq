#!/usr/bin/env -S node --import /root/.openclaw/workspace/projects/claudius-hq/node_modules/tsx/dist/loader.mjs
/**
 * Memoria Ingest Poller
 *
 * Runs every 5 minutes via cron. Polls Turso queue for pending items,
 * fetches content (tweets via twitter-cli, articles via fetch), formats
 * with frontmatter, and writes to /root/memoria-vault/entries/.
 */

import { createClient } from "@libsql/client";
import { writeFileSync, mkdirSync, existsSync, readFileSync } from "fs";
import { dirname, join } from "path";
import { execSync } from "child_process";

// ─── Config ───────────────────────────────────────────────────────────
const VAULT_ROOT = "/root/memoria-vault/entries";
const LOCK_FILE = "/tmp/memoria-ingest-poller.lock";
const DRY_RUN = process.argv.includes("--dry-run");

const TURSO_URL = process.env.TURSO_DATABASE_URL ?? readEnvFromFile("TURSO_DATABASE_URL");
const TURSO_TOKEN = process.env.TURSO_AUTH_TOKEN ?? readEnvFromFile("TURSO_AUTH_TOKEN");
const TELEGRAM_BOT_TOKEN = readEnvFromFile("TELEGRAM_BOT_TOKEN", "/root/.openclaw/credentials.env");

// ─── Helpers ──────────────────────────────────────────────────────────
function readEnvFromFile(key: string, path = "/root/.openclaw/workspace/projects/claudius-hq/.env.local"): string | undefined {
  try {
    const text = readFileSync(path, "utf-8");
    const match = text.match(new RegExp(`^${key}=["']?(.*?)["']?$`, "m"));
    return match?.[1];
  } catch { return undefined; }
}

function slugify(text: string, maxLen = 60): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, maxLen)
    .replace(/-+$/, "");
}

function today(): string {
  return new Date().toISOString().split("T")[0];
}

function escapeYaml(text: string): string {
  if (/[\":\n\r']/.test(text)) return `"${text.replace(/"/g, '\\"')}"`;
  return text;
}

async function sendTelegram(chatId: number, text: string): Promise<void> {
  if (!TELEGRAM_BOT_TOKEN) return;
  try {
    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
    });
  } catch {}
}

// ─── Twitter ingestion ───────────────────────────────────────────────
async function ingestTweet(url: string): Promise<{ path: string; title: string }> {
  const tweetId = url.match(/status\/(\d+)/)?.[1];
  if (!tweetId) throw new Error("Could not extract tweet ID from URL");

  // Load twitter credentials from credentials.env
  const credsPath = "/root/.openclaw/credentials.env";
  let authToken = "";
  let ct0 = "";
  try {
    const creds = readFileSync(credsPath, "utf-8");
    authToken = creds.match(/TWITTER_AUTH_TOKEN=["']?(.*?)["']?$/m)?.[1] ?? "";
    ct0 = creds.match(/TWITTER_CT0=["']?(.*?)["']?$/m)?.[1] ?? "";
  } catch {}

  if (!authToken || !ct0) throw new Error("Twitter credentials not found");

  const json = execSync(
    `twitter tweet ${tweetId} --json`,
    {
      env: { ...process.env, TWITTER_AUTH_TOKEN: authToken, TWITTER_CT0: ct0 },
      encoding: "utf-8",
      timeout: 15000,
    }
  );

  const data = JSON.parse(json);
  if (!data.ok || !data.data?.length) throw new Error("Twitter API error: " + (data.error?.message || "unknown"));

  const tweet = data.data[0];
  const author = tweet.author?.screenName ?? "unknown";
  const authorName = tweet.author?.name ?? author;
  const createdDate = tweet.createdAtISO ? tweet.createdAtISO.split("T")[0] : today();
  const text = tweet.text ?? "";
  const media = tweet.media ?? [];
  const metrics = tweet.metrics ?? {};

  // Build comments section from replies (data[1..n] are replies in the thread)
  const replies = data.data.slice(1);
  const commentsMd = replies
    .filter((r: any) => r.text && !r.text.includes("@" + author))
    .map((r: any) => {
      const rAuthor = r.author?.name ?? r.author?.screenName ?? "unknown";
      const rHandle = r.author?.screenName ? `@${r.author.screenName}` : "";
      const rDate = r.createdAtISO ? r.createdAtISO.split("T")[0] : createdDate;
      return `> **${rAuthor} ${rHandle}** · [${rDate}](https://x.com/${r.author?.screenName ?? ""}/status/${r.id})\n> \n> ${r.text.split("\n").join("\n> ")}`;
    })
    .join("\n\n");

  const mediaImages = media
    .filter((m: any) => m.type === "photo")
    .map((m: any) => `![Image](${m.url})`)
    .join("\n");

  const frontmatter = `---
source_type: tweet
title: Post by @${author} on X
author: '[[@${author}]]'
url: '${url}'
created: '${createdDate}'
tags:
  - tweets
---
${text}

${mediaImages}

---

## Comments

${commentsMd}`;

  const slug = slugify(text.slice(0, 80));
  const filename = `${createdDate}-${author}-${slug}.md`;
  const dir = join(VAULT_ROOT, "tweets");
  const fullPath = join(dir, filename);

  mkdirSync(dir, { recursive: true });
  writeFileSync(fullPath, frontmatter, "utf-8");

  return { path: fullPath, title: `Post by @${author}` };
}

// ─── Article ingestion ─────────────────────────────────────────────────
async function ingestArticle(url: string): Promise<{ path: string; title: string }> {
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();

  // Extract title
  const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  let title = titleMatch?.[1]?.trim() ?? new URL(url).hostname;

  // Simple HTML-to-text extraction
  let body = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  // Truncate to first ~3000 chars for MVP
  body = body.slice(0, 3000) + (body.length > 3000 ? "\n\n...[truncated]" : "");

  const created = today();
  const domain = new URL(url).hostname.replace(/^www\./, "");
  const slug = slugify(title || domain);
  const filename = `${created}-${slug}.md`;
  const dir = join(VAULT_ROOT, "articles");
  const fullPath = join(dir, filename);

  const frontmatter = `---
source_type: article
title: ${escapeYaml(title)}
url: '${url}'
created: '${created}'
tags:
  - articles
---

${body}`;

  mkdirSync(dir, { recursive: true });
  writeFileSync(fullPath, frontmatter, "utf-8");

  return { path: fullPath, title };
}

// ─── Main loop ─────────────────────────────────────────────────────────
async function main() {
  if (existsSync(LOCK_FILE)) {
    const pid = readFileSync(LOCK_FILE, "utf-8").trim();
    try {
      process.kill(Number(pid), 0);
      console.log(`[${new Date().toISOString()}] Another instance is running (pid ${pid}). Exiting.`);
      return;
    } catch {
      // stale lock
    }
  }
  writeFileSync(LOCK_FILE, String(process.pid), "utf-8");

  try {
    if (!TURSO_URL || !TURSO_TOKEN) {
      console.error("Missing Turso credentials");
      return;
    }

    const client = createClient({ url: TURSO_URL, authToken: TURSO_TOKEN });

    const { rows } = await client.execute({
      sql: `SELECT id, url, source_type, telegram_chat_id FROM memoria_ingest_queue WHERE status = 'pending' ORDER BY id ASC LIMIT 10`,
    });

    if (rows.length === 0) {
      console.log(`[${new Date().toISOString()}] No pending items.`);
      return;
    }

    console.log(`[${new Date().toISOString()}] Processing ${rows.length} item(s)...`);

    for (const row of rows) {
      const id = row.id as number;
      const url = row.url as string;
      const sourceType = row.source_type as string;
      const chatId = row.telegram_chat_id as number | null;

      if (DRY_RUN) {
        console.log(`[DRY RUN] Would process #${id}: ${url} (${sourceType})`);
        continue;
      }

      await client.execute({
        sql: `UPDATE memoria_ingest_queue SET status = 'processing' WHERE id = ?`,
        args: [id],
      });

      try {
        let result: { path: string; title: string };

        if (sourceType === "tweet" || url.includes("x.com") || url.includes("twitter.com")) {
          result = await ingestTweet(url);
        } else {
          result = await ingestArticle(url);
        }

        await client.execute({
          sql: `UPDATE memoria_ingest_queue SET status = 'done', vault_path = ?, processed_at = datetime('now') WHERE id = ?`,
          args: [result.path, id],
        });

        console.log(`[done] #${id} → ${result.path}`);

        if (chatId) {
          await sendTelegram(chatId, `✅ <b>Memoria ingested</b>\n\n${result.title}\n\n${result.path.replace("/root/memoria-vault/", "")}`);
        }
      } catch (err: any) {
        const msg = err.message || String(err);
        await client.execute({
          sql: `UPDATE memoria_ingest_queue SET status = 'failed', error_message = ? WHERE id = ?`,
          args: [msg.slice(0, 500), id],
        });
        console.error(`[failed] #${id}: ${msg}`);

        if (chatId) {
          await sendTelegram(chatId, `❌ <b>Memoria ingest failed</b>\n\n${url}\n\n${msg.slice(0, 200)}`);
        }
      }
    }
  } finally {
    try { require("fs").unlinkSync(LOCK_FILE); } catch {}
  }
}

main().catch((e) => {
  console.error("Fatal error:", e);
  process.exit(1);
});
