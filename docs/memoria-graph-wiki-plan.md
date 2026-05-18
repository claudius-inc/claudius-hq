# Memoria Graph Renderer & Wiki Generator — Implementation Plan

## Overview
Replace Obsidian's core features (graph view, backlinks, bidirectional linking) with HQ-native implementations powered by the mnemon knowledge graph.

## Architecture

### Data Flow
```
mnemon (VPS SQLite) → sync script → Turso (mnemon_graph_snapshots)
                                                    ↓
HQ API (/api/memoria/mnemon/graph) → Memoria Graph UI (/memoria/graph)
                                                ↓
Wiki generator clusters insights → Gemini API → memoria_wiki_pages
                                                ↓
Wiki UI (/memoria/wiki/[slug]) with backlinks
```

## Implementation Steps

### 1. Schema Updates
**File:** `src/db/schema.ts`
- Add `memoria_wiki_pages` table
- Add `mnemon_graph_snapshots` table
- Run drizzle-kit generate + migrate

### 2. API Routes
**New files:**
- `src/app/api/memoria/mnemon/graph/route.ts` — GET cached graph snapshot
- `src/app/api/memoria/wiki/route.ts` — GET list, POST generate
- `src/app/api/memoria/wiki/[slug]/route.ts` — GET, PATCH, DELETE single wiki
- `src/app/api/memoria/wiki/generate/route.ts` — POST on-demand generation

### 3. UI Components
**New files:**
- `src/app/memoria/graph/page.tsx` — Graph view page
- `src/app/memoria/wiki/page.tsx` — Wiki index/list
- `src/app/memoria/wiki/[slug]/page.tsx` — Single wiki page with backlinks
- `src/app/memoria/_components/GraphCanvas.tsx` — Force-directed graph renderer
- `src/app/memoria/_components/WikiCard.tsx` — Wiki list item
- `src/app/memoria/_components/WikiBacklinks.tsx` — Backlinks panel

### 4. Graph Renderer
- Use `react-force-graph-2d` for the force-directed graph
- Color nodes by category (fact/insight/context/decision)
- Color edges by type (semantic/causal/temporal/entity)
- Click to show node content in sidebar
- Filters: category, edge type, importance threshold

### 5. Wiki Generator
- Cluster insights by shared entities/tags
- Generate markdown narrative using existing Gemini integration
- Store in `memoria_wiki_pages`
- Render with `react-markdown` + `remark-gfm`
- Auto-link mentions of other wiki pages and source insights

### 6. Data Bridge / Sync Script
**New file:** `scripts/sync-mnemon-to-hq.ts`
- Export mnemon insights + edges as JSON
- Insert into `mnemon_graph_snapshots` table in Turso
- Run via cron on VPS (e.g., hourly)

### 7. Tests
**New files:**
- `src/__tests__/api/memoria-graph.test.ts`
- `src/__tests__/api/memoria-wiki.test.ts`

## Node Colors (by category)
| Category | Color |
|----------|-------|
| fact | #3B82F6 (blue) |
| insight | #10B981 (green) |
| context | #F59E0B (amber) |
| decision | #EF4444 (red) |
| general | #6B7280 (gray) |

## Edge Colors (by type)
| Type | Color |
|------|-------|
| semantic | #8B5CF6 (purple) |
| causal | #EF4444 (red) |
| temporal | #3B82F6 (blue) |
| entity | #10B981 (green) |

## Mobile-First Design
- Graph: full-width canvas, collapsible sidebar for node details
- Wiki: single column, stacked backlinks at bottom
- Use lucide-react icons only
- Light theme default
