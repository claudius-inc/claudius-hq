# Loading States Guidelines

This document defines when to use Skeleton vs Spinner loading patterns in Claudius HQ.

## Quick Decision Tree

```
Is content replacing existing layout?
├── YES → Skeleton (preserves layout, prevents CLS)
│         - Page initial load
│         - Table/list data loading
│         - Card content loading
│
└── NO → Is user waiting for an action?
    ├── YES → Spinner (indicates processing)
    │         - Form submission
    │         - Button click action
    │         - Refresh/sync operation
    │
    └── NO → Consider no loading indicator
              - Background data refresh
              - Very fast operations (<100ms)
```

## Skeleton (Layout-Preserving)

Use Skeleton when loading content that will occupy space in the layout. Skeletons prevent Cumulative Layout Shift (CLS) by reserving the space before content loads.

### When to Use
- **Initial page load** — show skeleton matching the expected layout
- **Data tables** — show skeleton rows maintaining column structure
- **Cards/panels** — preserve card dimensions during load
- **Lists** — maintain list item heights

### Component Imports

```tsx
import { 
  Skeleton,           // Basic building block
  SkeletonText,       // Multi-line text
  SkeletonTable,      // Generic table
  SkeletonTableRow,   // Single row
  SkeletonCard,       // Card with content
  // Page-specific skeletons:
  ThemesTableSkeleton,
  SectorMomentumSkeleton,
  GlobalMarketsSkeleton,
  PortfolioSkeleton,
} from "@/components/Skeleton";
```

### Usage Examples

```tsx
// Basic skeleton
<Skeleton className="h-4 w-24" />

// Multi-line text
<SkeletonText lines={3} />

// With Suspense (server components)
<Suspense fallback={<Skeleton className="h-96 w-full" />}>
  <AsyncDataComponent />
</Suspense>

// Full page skeleton (client components)
if (loading) {
  return <ThemesTableSkeleton />;
}
```

### Pattern: Include PageHero in Loading State

When a page has a PageHero, the skeleton should also show the hero area for visual consistency:

```tsx
if (loading) {
  return (
    <>
      <PageHero
        title="Portfolio"
        subtitle="Investment clarity journal and holdings"
      />
      <PortfolioSkeleton />
    </>
  );
}
```

Or use a composite skeleton that includes the hero (like `ThemesTableSkeleton`).

---

## Spinner (Action Pending)

Use Spinner when the user has triggered an action and is waiting for a response. Spinners indicate "something is happening" without layout implications.

### When to Use
- **Form submission** — button loading state
- **API actions** — save, delete, update operations
- **Refresh buttons** — data refresh/sync
- **Modal actions** — save, confirm operations

### Component Import

```tsx
import { Spinner } from "@/components/ui/Spinner";
```

### Usage Examples

```tsx
// In a button
<button disabled={saving}>
  {saving ? <Spinner size="sm" /> : "Save"}
</button>

// Centered loading indicator
<div className="flex items-center justify-center py-12">
  <Spinner size="lg" className="text-emerald-500" />
</div>
```

### Inline Spinner with Lucide Icons

For refresh buttons and inline actions, use Lucide's animated icons:

```tsx
import { RefreshCw, Loader2 } from "lucide-react";

// Refresh button
<button onClick={handleRefresh} disabled={refreshing}>
  <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
</button>

// Processing indicator
{processing && <Loader2 className="w-4 h-4 animate-spin" />}
```

---

## Patterns in Use

### ✅ Good Examples (Current Codebase)

| Component | Pattern | Why |
|-----------|---------|-----|
| `ResearchPage` | Skeleton in Suspense | Server-loaded data, preserves layout |
| `ThemesPageContent` | `ThemesTableSkeleton` | Full-page skeleton with hero area |
| `GlobalMarkets` | `GlobalMarketsSkeleton` | Complex layout preservation |
| `ScannerPage` | Skeleton fallback | Server component async data |
| `ResearchForm` | Loader2 spinner | Button action pending |
| `RefreshCw` buttons | Conditional animate-spin | User-triggered refresh |

### ⚠️ To Be Reviewed

| Component | Current | Recommended |
|-----------|---------|-------------|
| `ClarityJournal` | Inline spinner div | Consider `ClarityJournalSkeleton` |
| `ThemesTab` | Inline spinner div | Already has parent skeleton, OK |
| `SuggestedStocks` | Inline spinner | OK for modal loading |

---

## Rules of Thumb

1. **Skeletons for structure, Spinners for actions**
2. **Match skeleton to final layout** — same heights, widths, column counts
3. **Use page-specific skeletons** for complex pages
4. **Keep PageHero visible** during loading (static or skeleton)
5. **Spinners should be small and contextual** — near the action that triggered them
6. **Never use spinners for full-page initial load** — users see nothing, bad UX

---

## Creating New Skeletons

When adding a new complex component, create a matching skeleton:

```tsx
// In components/Skeleton.tsx

export function MyComponentSkeleton() {
  return (
    <div className="space-y-4">
      {/* Match the real component's structure */}
      <div className="flex items-center justify-between">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-8 w-24" />
      </div>
      <SkeletonTable rows={5} cols={4} />
    </div>
  );
}
```

Export it from `@/components/Skeleton` for consistent imports.
