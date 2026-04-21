#!/usr/bin/env python3
"""
Backfill all historical tweets from aleabitoreddit into Turso DB.
Uses twitter_cli Client with monkey-patched max count for full pagination.

Usage: python3 scripts/backfill-social-tweets.py
"""

import json
import os
import re
import sys
import time
import urllib.request

# --- Load credentials ---

def load_env(path):
    env = {}
    with open(path) as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith('#'):
                continue
            eq = line.find('=')
            if eq < 0:
                continue
            key = line[:eq].replace('export ', '').strip()
            val = line[eq+1:].strip().strip("'\"")
            env[key] = val
    return env

CREDS = load_env('/root/.openclaw/credentials.env')
AUTH_TOKEN = CREDS.get('TWITTER_AUTH_TOKEN', '')
CT0 = CREDS.get('TWITTER_CT0', '')

DB_ENV = load_env('/root/.openclaw/workspace/projects/claudius-hq/.env.local')
TURSO_URL = DB_ENV.get('TURSO_DATABASE_URL', '')
TURSO_TOKEN = DB_ENV.get('TURSO_DATABASE_TOKEN', '')

if not AUTH_TOKEN or not CT0:
    print("ERROR: Missing Twitter credentials"); sys.exit(1)
if not TURSO_URL or not TURSO_TOKEN:
    print("ERROR: Missing Turso credentials"); sys.exit(1)

# --- Monkey-patch to allow high count ---
SITE_PACKAGES = '/root/.local/share/pipx/venvs/twitter-cli/lib/python3.12/site-packages'
sys.path.insert(0, SITE_PACKAGES)

import twitter_cli.client as client_module
client_module._ABSOLUTE_MAX_COUNT = 10000

from twitter_cli.client import Client

TICKER_RE = re.compile(r'\$([A-Z]{1,5}[.]?[A-Z]{0,2})\b')

def extract_tickers(text):
    matches = set()
    for m in TICKER_RE.finditer(text):
        t = m.group(1)
        if not re.match(r'^\d', t):
            matches.add(t)
    return list(matches)

def turso_sql(sql, args=None):
    stmt = {"q": sql}
    if args:
        stmt["a"] = args
    body = json.dumps({"requests": [stmt]}).encode()
    req = urllib.request.Request(
        TURSO_URL,
        data=body,
        method="POST",
        headers={
            "Authorization": f"Bearer {TURSO_TOKEN}",
            "Content-Type": "application/json",
        },
    )
    with urllib.request.urlopen(req, timeout=15) as resp:
        return json.loads(resp.read())

def main():
    print("Creating Twitter client...")
    client = Client(AUTH_TOKEN, CT0, rate_limit_config={"maxCount": 10000})

    print("Fetching user profile for @aleabitoreddit...")
    profile = client.fetch_user("aleabitoreddit")
    user_id = profile.id if hasattr(profile, 'id') else profile.get('id') if isinstance(profile, dict) else str(profile)
    print(f"  User ID: {user_id}")

    print("Fetching all tweets (this may take a few minutes)...")
    tweets = client.fetch_user_tweets(user_id, 10000)
    print(f"  Fetched {len(tweets)} total tweets")

    total_tickers = 0
    new_count = 0
    skipped = 0
    batch = []

    for i, tweet in enumerate(tweets):
        text = tweet.text if hasattr(tweet, 'text') else tweet.get('text', '')
        if not text:
            continue

        tickers = extract_tickers(text)
        if not tickers:
            continue

        total_tickers += 1
        tweet_id = str(tweet.id if hasattr(tweet, 'id') else tweet.get('id', ''))

        # Build quoted tweet data
        quoted = None
        if hasattr(tweet, 'quoted_tweet') and tweet.quoted_tweet:
            quoted = tweet.quoted_tweet
        elif isinstance(tweet, dict) and tweet.get('quotedTweet'):
            quoted = tweet['quotedTweet']

        quoted_text = quoted.text if quoted and hasattr(quoted, 'text') else (quoted.get('text', '') if quoted and isinstance(quoted, dict) else '')
        quoted_tickers = extract_tickers(quoted_text) if quoted_text else []

        # Media
        media = []
        if hasattr(tweet, 'media') and tweet.media:
            media = [m.url for m in tweet.media if hasattr(m, 'url') and m.url]
        elif isinstance(tweet, dict) and tweet.get('media'):
            media = [m.get('url', '') for m in tweet['media'] if m.get('url')]

        # Metrics
        metrics = tweet.metrics if hasattr(tweet, 'metrics') else tweet.get('metrics', {})
        if metrics is None:
            metrics = {}

        likes = metrics.get('likes', 0) if isinstance(metrics, dict) else getattr(metrics, 'likes', 0)
        retweets = metrics.get('retweets', 0) if isinstance(metrics, dict) else getattr(metrics, 'retweets', 0)
        replies = metrics.get('replies', 0) if isinstance(metrics, dict) else getattr(metrics, 'replies', 0)
        bookmarks = metrics.get('bookmarks', 0) if isinstance(metrics, dict) else getattr(metrics, 'bookmarks', 0)
        views = metrics.get('views', 0) if isinstance(metrics, dict) else getattr(metrics, 'views', 0)

        # Author
        author_name = 'aleabitoreddit'
        screen_name = 'aleabitoreddit'
        if hasattr(tweet, 'author') and tweet.author:
            author_name = getattr(tweet.author, 'name', 'aleabitoreddit')
            screen_name = getattr(tweet.author, 'screenName', 'aleabitoreddit')

        created_at = tweet.created_at if hasattr(tweet, 'created_at') else tweet.get('createdAt', '')
        if hasattr(created_at, 'isoformat'):
            created_at = created_at.isoformat()

        is_quote = 1 if quoted_text else 0

        batch.append([
            tweet_id, author_name, screen_name, text,
            json.dumps(tickers), likes, retweets, replies, bookmarks, views,
            created_at, json.dumps(media), is_quote, quoted_text, json.dumps(quoted_tickers),
        ])

        # Insert in batches of 50
        if len(batch) >= 50:
            inserted = insert_batch(batch)
            new_count += inserted
            skipped += len(batch) - inserted
            print(f"  Batch: {len(batch)} tweets ({inserted} new, {len(batch)-inserted} dupes)")
            batch = []
            time.sleep(0.5)

    # Remaining
    if batch:
        inserted = insert_batch(batch)
        new_count += inserted
        skipped += len(batch) - inserted
        print(f"  Final batch: {len(batch)} tweets ({inserted} new, {len(batch)-inserted} dupes)")

    print(f"\n=== Backfill Complete ===")
    print(f"Total tweets fetched: {len(tweets)}")
    print(f"Tweets with tickers: {total_tickers}")
    print(f"New inserts: {new_count}")
    print(f"Already existed: {skipped}")


def insert_batch(rows):
    """Insert batch of rows. Returns count of actually inserted (via INSERT OR IGNORE)."""
    inserted = 0
    for row in rows:
        try:
            result = turso_sql(
                """INSERT OR IGNORE INTO tweet_tickers
                   (tweet_id, author, screen_name, text, tickers, likes, retweets, replies, bookmarks, views, created_at, media_urls, is_quote, quoted_text, quoted_tickers)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                row
            )
            # Check if row was actually inserted
            resp = result.get('results', [{}])[0].get('response', {})
            if resp.get('affected_row_count', 0) > 0:
                inserted += 1
        except Exception as e:
            print(f"  Warning: insert failed for tweet {row[0]}: {e}")
    return inserted


if __name__ == "__main__":
    main()
