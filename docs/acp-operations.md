# ACP Operations Control Plane

## Overview

HQ now serves as the central control plane for ACP operations, replacing file-based state management with database-driven operations.

## Database Tables

| Table | Description |
|-------|-------------|
| `acp_state` | Singleton row with current operational state (pillar, epoch, goals, server status) |
| `acp_tasks` | Priority-based task queue for heartbeat/cron execution |
| `acp_decisions` | Audit trail for strategic decisions |
| `acp_strategy` | Key-value store for configuration parameters |
| `acp_marketing` | Marketing campaign tracking with attribution |

## API Endpoints

### Read (No Auth Required)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/acp/state` | GET | Get current ACP state |
| `/api/acp/tasks` | GET | Get tasks (filter by ?pillar=, ?status=) |
| `/api/acp/decisions` | GET | Get recent decisions |
| `/api/acp/marketing` | GET | Get marketing campaigns |
| `/api/acp/strategy` | GET | Get strategy parameters |
| `/api/acp/heartbeat-context` | GET | **Key endpoint** - Returns everything an agent needs |

### Write (Requires `Authorization: Bearer $HQ_API_KEY`)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/acp/state` | PATCH | Update state fields |
| `/api/acp/tasks` | POST | Create new task |
| `/api/acp/tasks/:id` | PATCH | Update task (status, result, etc.) |
| `/api/acp/tasks/:id` | DELETE | Delete task |
| `/api/acp/decisions` | POST | Log a new decision |
| `/api/acp/marketing` | POST | Create campaign |
| `/api/acp/marketing/:id` | PATCH | Update campaign |
| `/api/acp/strategy` | PUT | Upsert strategy params |

## Heartbeat Context Response

The `/api/acp/heartbeat-context` endpoint returns a comprehensive snapshot:

```json
{
  "state": { ... },           // Current operational state
  "nextTask": { ... },        // Highest priority pending task
  "pendingTasks": 5,          // Count of pending tasks
  "recentDecisions": [...],   // Last 5 decisions
  "strategy": { ... },        // Grouped strategy params
  "activeExperiments": [...], // Price experiments in "measuring"
  "offeringsSummary": { ... }, // Aggregated offering stats
  "wallet": { ... },          // Latest wallet snapshot
  "currentEpochStats": { ... },
  "recentActivity": { ... },  // Last 24h activity summary
  "alerts": [...],            // Warnings/errors to address
  "instructions": "..."       // AI-generated guidance based on state
}
```

## Strategy Categories

- `pricing` - Price multipliers, min/max prices
- `offerings` - Max count, replacement thresholds
- `marketing` - Tweet/post targets
- `goals` - Epoch targets, rank goals
- `experiments` - Test duration, sample sizes

## Task Pillars

- `quality` - Reliability, bug fixes, response quality
- `replace` - Identify and replace underperformers
- `build` - Create new offerings
- `experiment` - A/B tests, pricing experiments

## Environment Variables

**Required in Vercel:**
- `HQ_API_KEY` - API key for write operations

## Usage Example

```bash
# Get current context for heartbeat
curl https://www.claudiusinc.com/api/acp/heartbeat-context

# Create a task (requires auth)
curl -X POST https://www.claudiusinc.com/api/acp/tasks \
  -H "Authorization: Bearer $HQ_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"pillar":"build","priority":75,"title":"Create weather offering"}'

# Update state
curl -X PATCH https://www.claudiusinc.com/api/acp/state \
  -H "Authorization: Bearer $HQ_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"currentPillar":"experiment"}'

# Log a decision
curl -X POST https://www.claudiusinc.com/api/acp/decisions \
  -H "Authorization: Bearer $HQ_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"decisionType":"pricing","offering":"tarot_reading","oldValue":"0.2","newValue":"0.25","reasoning":"Testing higher price point"}'
```

## Migration

Migration scripts are in `/scripts/`:
- `run-acp-migration.ts` - Creates tables
- `seed-acp-operations.ts` - Seeds initial data

Run with: `npx tsx scripts/run-acp-migration.ts`
