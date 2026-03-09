# Memoria — Personal Knowledge Vault

Memoria is a feature for capturing quotes, highlights, ideas, and thoughts from any source, then using AI to discover patterns across the collection.

**Philosophy:** Low-friction capture now, AI-powered pattern discovery later.

---

## Architecture Overview

```
src/
├── lib/gemini.ts              # Gemini AI: extraction + analysis functions
├── db/schema.ts               # 4 tables (memoriaEntries, memoriaTags, memoriaEntryTags, memoriaInsights)
├── app/
│   ├── api/memoria/
│   │   ├── route.ts           # GET (list) + POST (create)
│   │   ├── [id]/route.ts      # GET + PATCH + DELETE
│   │   ├── random/route.ts    # GET random entry
│   │   ├── search/route.ts    # GET full-text search (LIKE)
│   │   ├── tags/route.ts      # GET + POST tags
│   │   ├── tags/[id]/route.ts # DELETE tag
│   │   ├── extract/text/route.ts   # POST: Gemini text extraction
│   │   ├── extract/image/route.ts  # POST: Gemini image extraction
│   │   ├── insights/route.ts       # GET + POST insights
│   │   └── insights/[id]/route.ts  # DELETE insight
│   └── memoria/
│       ├── layout.tsx         # Nav + main wrapper
│       ├── page.tsx           # Main page (client component, state orchestrator)
│       └── _components/
│           ├── MemoriaHeader.tsx      # Search, Add, Random buttons
│           ├── MemoriaFilters.tsx     # Source type pills + tag dropdown
│           ├── MemoriaGrid.tsx        # Masonry card layout
│           ├── EntryCard.tsx          # Individual entry card
│           ├── TagBadge.tsx           # Colored tag pill
│           ├── AddEntryModal.tsx      # Single / Bulk Text / Image tabs
│           ├── BulkReviewStep.tsx     # Review AI-extracted entries before saving
│           ├── RandomModal.tsx        # Random entry display
│           ├── EntryDetailModal.tsx   # View / Edit / Delete single entry
│           └── InsightsPanel.tsx      # AI analysis: patterns, connections, distillation
```

---

## Database Schema

All tables are defined in `src/db/schema.ts` using Drizzle ORM (SQLite via libsql/Turso). After modifying the schema, run `npx drizzle-kit push` to sync.

### `memoria_entries`

The core table. Each row is one quote, highlight, idea, or thought.

| Column | Type | Notes |
|--------|------|-------|
| `id` | integer PK autoincrement | |
| `content` | text NOT NULL | The quote/highlight/idea itself |
| `source_type` | text NOT NULL | One of: `book`, `article`, `podcast`, `conversation`, `thought`, `tweet`, `video` |
| `source_title` | text | Book title, article name, etc. |
| `source_author` | text | |
| `source_url` | text | |
| `source_location` | text | Page number, chapter, timestamp |
| `my_note` | text | Personal annotation |
| `ai_tags` | text | JSON array of auto-suggested tags (from Gemini) |
| `ai_summary` | text | One-line AI summary for search |
| `is_favorite` | integer default 0 | |
| `is_archived` | integer default 0 | Archived entries hidden from default view |
| `created_at` | text | `datetime('now')` |
| `updated_at` | text | `datetime('now')` |
| `captured_at` | text | When originally captured (user-supplied) |
| `last_surfaced_at` | text | Updated when shown via random endpoint |

### `memoria_tags`

User-created tags with optional colors.

| Column | Type | Notes |
|--------|------|-------|
| `id` | integer PK autoincrement | |
| `name` | text UNIQUE NOT NULL | Lowercase, trimmed on creation |
| `color` | text | Hex color for badge display |
| `created_at` | text | |

### `memoria_entry_tags`

Junction table. Many-to-many between entries and tags.

| Column | Type | Notes |
|--------|------|-------|
| `entry_id` | integer FK → memoria_entries.id | ON DELETE CASCADE |
| `tag_id` | integer FK → memoria_tags.id | ON DELETE CASCADE |

### `memoria_insights`

AI-generated analysis results.

| Column | Type | Notes |
|--------|------|-------|
| `id` | integer PK autoincrement | |
| `insight_type` | text | `patterns`, `connections`, or `distillation` |
| `title` | text | |
| `content` | text NOT NULL | Markdown analysis output |
| `entry_ids` | text | JSON array of entry IDs that contributed |
| `generated_at` | text | `datetime('now')` |

---

## Gemini Integration

**File:** `src/lib/gemini.ts`
**Dependency:** `@google/generative-ai` (already in package.json)
**Env var:** `GEMINI_API_KEY`

### Extraction Functions (Phase 1)

Used when ingesting content. The key design decision: **content is preserved verbatim** — the AI must not summarize or compress the content field. The `aiSummary` field is the only place compression happens.

**`extractFromText(text, sourceInfo)`**
- Model: `gemini-2.0-flash`
- Input: raw text + source metadata
- Output: `ParsedEntry[]` — each with `content` (verbatim), `aiTags`, `aiSummary`
- Prompt instructs: preserve original wording, only split on genuinely different ideas, keep multi-sentence thoughts intact

**`extractFromImage(base64, sourceInfo)`**
- Same as text but with vision input
- Detects JPEG vs PNG from base64 prefix (`/9j/` = JPEG)

### Analysis Functions (Phase 2)

Used to discover patterns across the collection. All three send the full set of non-archived entries to Gemini.

**`analyzePatterns(entries)`**
- Finds recurring themes across entries from different sources
- Requires each pattern to reference 2+ entries by ID
- Writes in second person ("You keep returning to...")

**`analyzeConnections(entries)`**
- Finds non-obvious links between 2-3 entries from different contexts
- Explains the shared deeper principle

**`analyzeDistillation(entries)`**
- Synthesizes personal frameworks from clusters of 3+ entries
- "Based on what you've collected, your operating principle for X seems to be..."

All analysis functions:
- Model: `gemini-3.1-pro-preview` (deeper reasoning needed for analysis)
- Return `AnalysisResult[]` with `{ title, content (markdown), entryIds }`
- Entries are formatted with `[#id]` prefix, source metadata, content, notes, and tags

---

## API Routes

All routes follow the project convention:
- `NextRequest`/`NextResponse` from `next/server`
- Import from `@/db` for database access
- `@/lib/logger` for structured error logging
- Try/catch with `logger.error(source, message, { error: e })`
- Auth handled by middleware (not per-route)

### Entries CRUD

**`GET /api/memoria`** — List entries
Query params: `source_type`, `tag` (tag ID), `favorite` ("1"), `page`, `per_page` (default 50)
Returns: `{ entries: [...with tags], total: number }`
- Always excludes `is_archived = 1`
- Joins entry_tags + tags for each entry
- Ordered by `created_at` desc

**`POST /api/memoria`** — Create entry
Body: `{ content, source_type, source_title?, source_author?, source_url?, source_location?, my_note?, tag_ids?, captured_at? }`
Returns: `{ entry }` (201)

**`GET /api/memoria/[id]`** — Single entry with tags

**`PATCH /api/memoria/[id]`** — Partial update
Supports: `content`, `source_type`, `source_title`, `source_author`, `source_url`, `source_location`, `my_note`, `is_favorite`, `is_archived`, `tag_ids` (replaces all tags)

**`DELETE /api/memoria/[id]`** — Delete entry (cascades to entry_tags)

### Random

**`GET /api/memoria/random`**
Returns one random non-archived entry. Excludes entries surfaced in the last 24 hours (falls back to any entry if all were recently surfaced). Updates `last_surfaced_at`.

### Search

**`GET /api/memoria/search?q=...`**
SQL LIKE search across: `content`, `source_title`, `source_author`, `my_note`, `ai_tags`. Limit 100 results. (FTS5 deferred — LIKE is sufficient for MVP volumes.)

### AI Extraction

**`POST /api/memoria/extract/text`**
Body: `{ text, source_type?, source_title?, source_author? }`
Returns: `{ entries: ParsedEntry[] }` — for client-side review, does NOT auto-save

**`POST /api/memoria/extract/image`**
Body: `{ image (base64), source_type?, source_title?, source_author? }`
Returns: `{ entries: ParsedEntry[] }`

### Tags

**`GET /api/memoria/tags`** — All tags ordered by name
**`POST /api/memoria/tags`** — Create tag `{ name, color? }` (name lowercased + trimmed)
**`DELETE /api/memoria/tags/[id]`** — Delete tag (cascades from entry_tags)

### Insights

**`GET /api/memoria/insights`** — All insights ordered by `generated_at` desc
**`POST /api/memoria/insights`** — Generate new insights
Body: `{ type: "patterns" | "connections" | "distillation" }`
- Fetches all non-archived entries
- Requires 3+ entries minimum
- Calls the corresponding Gemini analysis function
- Saves each result to `memoria_insights` table
- Returns: `{ insights: [...] }` (201)

**`DELETE /api/memoria/insights/[id]`** — Remove an insight

---

## Frontend

### Page Structure

`src/app/memoria/page.tsx` is a `"use client"` component that orchestrates all state:

**State:**
- `entries[]`, `tags[]` — fetched from API
- `loading` — for entry grid
- `activeSourceFilter` (string | null), `activeTagFilter` (number | null), `searchQuery` (string)
- `showAddModal`, `showRandomModal`, `selectedEntry` — modal visibility

**Layout order:**
1. `MemoriaHeader` — title, debounced search (300ms), Random button, Add button
2. `MemoriaFilters` — source type pills (All | book | article | ...) + tag dropdown
3. `InsightsPanel` — collapsible AI analysis section
4. `MemoriaGrid` — masonry card grid

### Key Components

**`MemoriaGrid`** — CSS `columns-1 md:columns-2 lg:columns-3` masonry layout with `break-inside-avoid` on cards. Shows loading spinner or empty state ("No entries yet").

**`EntryCard`** — Shows source icon (lucide-react), source type + title, content (truncated at 200 chars with "more" toggle), author, personal note (italic, left-bordered), tag badges, favorite star toggle. Click opens detail modal.

**`AddEntryModal`** — Three tabs:
- **Single**: content textarea, source fields, location, note, tag picker → save one entry
- **Bulk Text**: paste textarea → "Parse with AI" → transitions to `BulkReviewStep`
- **Image**: file upload → "Extract with AI" → transitions to `BulkReviewStep`

**`BulkReviewStep`** — Checklist of AI-extracted entries. Each has a checkbox, content preview, AI-suggested tags. "Save N Entries" button batch-creates selected entries.

**`RandomModal`** — Fetches `GET /api/memoria/random`, displays in focused view with favorite toggle and "Next Random" button.

**`EntryDetailModal`** — Two modes:
- **View**: full content, metadata, tags, created date, Edit button, Delete with confirmation
- **Edit**: all fields editable, tag picker, save/cancel

**`InsightsPanel`** — Collapsible section with:
- Three generate buttons: Patterns, Connections, Distillation (with loading spinner)
- Results grouped by type, each insight expandable to show markdown content
- Shows contributing entry IDs
- Delete button per insight

### Navigation

`src/components/Nav.tsx` — `{ href: "/memoria", label: "Memoria" }` added to sections array.

---

## Design Decisions

1. **Verbatim preservation**: The extraction prompt explicitly forbids summarizing the `content` field. Only `aiSummary` is compressed. This was tuned after the initial prompt was too aggressive at paraphrasing.

2. **LIKE search over FTS5**: Good enough for personal-scale volumes (hundreds to low thousands of entries). FTS5 can be added later if needed.

3. **Random with 24h cooldown**: Prevents seeing the same entry twice in a day. Falls back gracefully when all entries have been surfaced recently.

4. **AI extraction returns for review**: The extract endpoints return parsed entries to the client without saving. The user reviews, edits, and selects which to keep via `BulkReviewStep`.

5. **Analysis uses a stronger model**: Extraction uses `gemini-2.0-flash` (fast, cheap). Analysis uses `gemini-3.1-pro-preview` (deeper reasoning for pattern discovery).

6. **Insights are persistent**: Generated insights are saved to the database, not ephemeral. This means you can generate them once and revisit later without re-running the AI.

7. **Entry tags vs AI tags**: Two separate systems. `ai_tags` (JSON string on the entry) are auto-suggested during extraction. `memoria_tags` + `memoria_entry_tags` are user-managed tags with colors.

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `GEMINI_API_KEY` | Yes (for AI features) | Google AI API key for Gemini models |
| `TURSO_DATABASE_URL` | Yes | Turso/libsql database URL |
| `TURSO_AUTH_TOKEN` | Yes | Turso auth token |

---

## Setup From Scratch

1. Add the schema tables to `src/db/schema.ts` (see Database Schema section)
2. Run `npx drizzle-kit push` to create tables
3. Ensure `GEMINI_API_KEY` is set in `.env.local`
4. Create `src/lib/gemini.ts` with extraction + analysis functions
5. Create the API routes under `src/app/api/memoria/`
6. Create the frontend at `src/app/memoria/` with the component structure above
7. Add Memoria to the Nav sections array
