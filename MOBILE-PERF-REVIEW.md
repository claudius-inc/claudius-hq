# Mobile & Performance Review: Claudius HQ

**Date:** 2026-02-15  
**Reviewer:** Claude (automated review)

---

## Executive Summary

The codebase has **several large components** that need splitting, some **touch target issues** for mobile, and opportunities to leverage **server components** better. Tables are properly wrapped for horizontal scroll, and `next/image` is used where images exist.

---

## 🔴 Critical Issues

### 1. Large Components (6 files over 500 lines)

These files violate the 500-line component guideline and should be split:

| File | Lines | Priority |
|------|-------|----------|
| `src/app/markets/analysts/AnalystsPageContent.tsx` | **1006** | 🔴 Critical |
| `src/components/ThemesTab.tsx` | **838** | 🔴 Critical |
| `src/app/markets/gold/GoldContent.tsx` | **744** | 🔴 High |
| `src/app/markets/page.tsx` | **646** | 🟠 High |
| `src/app/markets/alerts/AlertsPageContent.tsx` | **564** | 🟠 Medium |
| `src/components/PortfolioTab.tsx` | **560** | 🟠 Medium |
| `src/components/IBKRPortfolio.tsx` | **526** | 🟠 Medium |

**Recommendation:** Split these into smaller, focused components:

```tsx
// Before: ThemesTab.tsx (838 lines with everything)
// After: Split into:
// - ThemesTab.tsx (orchestrator, ~100 lines)
// - ThemeLeaderboard.tsx (~150 lines)  
// - ThemeExpandedRow.tsx (~200 lines)
// - AddThemeModal.tsx (~150 lines)
// - EditStockModal.tsx (~100 lines)
// - SuggestedStocks.tsx (~100 lines)
```

---

## 🟠 Mobile UX Issues

### 2. Touch Targets Too Small

Many interactive elements use `p-1` or `p-1.5` padding, resulting in touch targets **~24-28px** instead of the recommended **44px minimum**.

**Affected files:**

| File | Line | Issue |
|------|------|-------|
| `src/components/ThemesTab.tsx` | 541, 547 | Delete/Edit buttons with `p-1` |
| `src/components/PortfolioTab.tsx` | 309-321 | Edit/Delete buttons with `p-1` |
| `src/components/IBKRPortfolio.tsx` | 416 | Delete button with `p-1` |
| `src/app/markets/analysts/AnalystsPageContent.tsx` | 494, 501 | Action buttons with `p-1.5` |
| `src/app/markets/alerts/AlertsPageContent.tsx` | 290, 297, 310 | Icon buttons with `p-1.5` |

**Fix:** Add minimum touch area wrapper:

```tsx
// Before
<button className="p-1 text-gray-400 hover:text-red-600">
  <Trash2 className="w-4 h-4" />
</button>

// After - Option 1: Increase padding
<button className="p-2.5 -m-1.5 text-gray-400 hover:text-red-600">
  <Trash2 className="w-4 h-4" />
</button>

// After - Option 2: Set min dimensions
<button className="p-1 min-w-[44px] min-h-[44px] flex items-center justify-center text-gray-400 hover:text-red-600">
  <Trash2 className="w-4 h-4" />
</button>
```

### 3. Form Input Types

Most text inputs for tickers use `type="text"` which is fine, but consider adding `inputMode` for better mobile keyboards:

| File | Line | Current | Suggested |
|------|------|---------|-----------|
| `src/components/ResearchForm.tsx` | 75 | `type="text"` | Add `inputMode="text" autoCapitalize="characters"` |
| `src/app/markets/page.tsx` | 193 | `type="text"` | Add `autoCapitalize="characters"` |
| `src/components/ThemesTab.tsx` | 742 | `type="text"` | Add `autoCapitalize="characters"` |

**Fix:**
```tsx
<input
  type="text"
  inputMode="text"
  autoCapitalize="characters"
  placeholder="Enter ticker (e.g., AAPL)"
  // ...
/>
```

---

## 🟢 Good Practices Found

### ✅ Table Horizontal Scroll
All 14 tables are properly wrapped with `overflow-x-auto`:
- `src/components/ThemesTab.tsx:278` ✅
- `src/components/PortfolioTab.tsx:181` ✅  
- `src/components/IBKRPortfolio.tsx:276` ✅
- All other table components ✅

### ✅ Mobile Navigation
- `MobileMenu.tsx` component exists and works correctly
- Hamburger menu shows on `md:hidden`
- Touch targets on nav links are adequate (`px-3 py-2.5`)

### ✅ Image Optimization
- No raw `<img>` tags found
- `next/image` used in `Nav.tsx:2` and `ThemesTab.tsx:5`

### ✅ Modal Dialogs
- `ConfirmDialog.tsx` has proper focus trap and escape key handling
- Modals use `fixed inset-0` with backdrop
- Max-width constraints work well on mobile

---

## 🟡 Performance Opportunities

### 4. Client vs Server Components

Currently, 2 page.tsx files use `"use client"`:
- `src/app/login/page.tsx` - **Appropriate** (form state)
- `src/app/markets/page.tsx` - **Could be improved** (646 lines, fetches data in useEffect)

**Recommendation:** Convert markets dashboard to use Server Components for initial data:

```tsx
// src/app/markets/page.tsx (server component)
import { MarketsDashboard } from "@/components/MarketsDashboard";
import { fetchPortfolio, fetchMacro, fetchReports, fetchSentiment } from "@/lib/data";

export default async function MarketsPage() {
  const [portfolio, macro, reports, sentiment] = await Promise.all([
    fetchPortfolio(),
    fetchMacro(),
    fetchReports(),
    fetchSentiment(),
  ]);

  return (
    <MarketsDashboard
      initialPortfolio={portfolio}
      initialMacro={macro}
      initialReports={reports}
      initialSentiment={sentiment}
    />
  );
}
```

This would:
- ✅ Reduce client-side JavaScript
- ✅ Improve First Contentful Paint (FCP)
- ✅ Enable data caching at the edge

### 5. Bundle Size - Heavy Dependencies

From `package.json`:

| Dependency | Size | Recommendation |
|------------|------|----------------|
| `xlsx` | ~500KB | Consider lazy loading for import feature only |
| `yahoo-finance2` | ~200KB | Keep (core functionality) |
| `marked` + `react-markdown` | Overlap | Pick one, lazy load |

**Fix for xlsx:**
```tsx
// src/components/IBKRPortfolio.tsx
const handleUpload = async (file: File) => {
  // Lazy load xlsx only when needed
  const XLSX = await import('xlsx');
  const workbook = XLSX.read(await file.arrayBuffer());
  // ...
};
```

### 6. Data Fetching Pattern

Multiple parallel fetches in `useEffect` could benefit from React Query or SWR:

```tsx
// Current pattern (markets/page.tsx:238-273)
useEffect(() => {
  fetch("/api/ibkr/positions").then(...);
  fetch("/api/macro").then(...);
  fetch("/api/markets/reports").then(...);
  fetch("/api/markets/sentiment").then(...);
}, []);

// Better: Use SWR with deduplication
import useSWR from 'swr';

const { data: portfolio } = useSWR('/api/ibkr/positions', fetcher);
const { data: macro } = useSWR('/api/macro', fetcher);
// Benefits: caching, revalidation, deduplication
```

---

## 📋 Action Items

### High Priority (Do First)
1. [ ] Split `AnalystsPageContent.tsx` (1006 lines) into 4-5 smaller components
2. [ ] Split `ThemesTab.tsx` (838 lines) into focused sub-components
3. [ ] Add minimum 44px touch targets to all icon buttons
4. [ ] Convert `markets/page.tsx` to server component with client children

### Medium Priority
5. [ ] Split `GoldContent.tsx` (744 lines)
6. [ ] Lazy load `xlsx` dependency
7. [ ] Add `autoCapitalize="characters"` to ticker inputs
8. [ ] Consider SWR/React Query for data fetching

### Low Priority
9. [ ] Split `PortfolioTab.tsx`, `IBKRPortfolio.tsx`, `AlertsPageContent.tsx`
10. [ ] Consolidate `marked` and `react-markdown` (pick one)

---

## Test Checklist

Before deploying mobile fixes:
- [ ] Test all tables scroll horizontally on 375px viewport
- [ ] Verify all buttons are easily tappable with thumb
- [ ] Check modals don't overflow on small screens
- [ ] Ensure keyboard doesn't cover form inputs
- [ ] Test mobile nav hamburger menu

---

*Report generated by automated code review*
