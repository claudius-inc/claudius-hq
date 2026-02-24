# UX/UI Consistency Review — Claudius HQ

**Generated:** 2026-02-15  
**Reviewed Pages:** 9 main pages + 15 components

---

## Executive Summary

The Claudius HQ application has a generally consistent design system but suffers from several inconsistencies that have accumulated over development. The most critical issues are:

1. **Layout wrapper duplication** in Projects/Ideas pages
2. **Inconsistent loading states** (mix of Skeleton components and inline spinners)
3. **Card padding inconsistency** (p-4 vs p-5 vs p-6)
4. **Button style inconsistency** (some use utility classes, others inline)

---

## Priority 1: Critical (Should Fix First)

### 1.1 Layout Wrapper Inconsistency

**Issue:** Projects and Ideas pages include their own Nav and main wrapper, while Markets pages use the shared `MarketsLayout`.

**Files Affected:**
- `/src/app/projects/page.tsx:18-25`
- `/src/app/ideas/page.tsx:18-27`

**Current (Inconsistent):**
```tsx
// projects/page.tsx and ideas/page.tsx
return (
  <div className="min-h-screen">
    <Nav />
    <main className="max-w-6xl mx-auto px-4 py-6">
      {/* content */}
    </main>
  </div>
);
```

**Markets pages use layout:**
```tsx
// markets/layout.tsx (shared)
export default function MarketsLayout({ children }) {
  return (
    <div className="min-h-screen">
      <Nav />
      <main className="max-w-6xl mx-auto px-4 py-6">
        {children}
      </main>
    </div>
  );
}
```

**Recommendation:**
Create a shared `RootLayout` or have Projects/Ideas use similar layout files for consistency. This also reduces code duplication.

---

### 1.2 Inconsistent Loading States

**Issue:** Some pages use the shared `<Skeleton>` component, others use inline `animate-pulse` divs or custom spinners.

| Page/Component | Loading Implementation | Consistent? |
|----------------|----------------------|-------------|
| Markets Dashboard | `<Skeleton>` component | ✅ |
| Research | `<Skeleton>` via Suspense | ✅ |
| Portfolio/IBKRPortfolio | Custom spinner `<RefreshCw className="animate-spin">` | ❌ |
| Macro/MacroContent | Inline `animate-pulse` divs | ❌ |
| Gold/GoldContent | Inline `animate-pulse` divs | ❌ |
| Themes/ThemesTab | Custom spinner div | ❌ |
| Sectors/SectorMomentum | `<SectorMomentumSkeleton>` | ✅ |
| Global Markets | `<GlobalMarketsSkeleton>` | ✅ |

**Files Affected:**
- `/src/app/markets/macro/MacroContent.tsx:135-145`
- `/src/app/markets/gold/GoldContent.tsx:117-127`
- `/src/components/ThemesTab.tsx:207-211`
- `/src/components/IBKRPortfolio.tsx:148-154`

**Example — MacroContent.tsx (lines 135-145):**
```tsx
// ❌ Inline loading
if (loading) {
  return (
    <div className="space-y-6">
      {[1, 2, 3].map(i => (
        <div key={i} className="card p-6 animate-pulse">
          <div className="h-6 bg-gray-200 rounded w-1/3 mb-4" />
          <div className="h-4 bg-gray-200 rounded w-2/3 mb-2" />
          <div className="h-4 bg-gray-200 rounded w-1/2" />
        </div>
      ))}
    </div>
  );
}
```

**Recommendation:**
Replace inline loading states with `<SkeletonCard>` from Skeleton.tsx:

```tsx
// ✅ Use shared component
import { SkeletonCard } from "@/components/Skeleton";

if (loading) {
  return (
    <div className="space-y-6">
      <SkeletonCard />
      <SkeletonCard />
      <SkeletonCard />
    </div>
  );
}
```

---

### 1.3 Card Padding Inconsistency

**Issue:** The `.card` class defines `p-4`, but many usages override it with `p-5` or `p-6`.

| Component | Padding Used |
|-----------|--------------|
| globals.css `.card` | `p-4` |
| Markets Dashboard DashboardCard | `p-5` |
| MacroContent cards | `p-5` |
| GoldContent cards | `p-6` |
| IBKRPortfolio | `p-4` |
| StockFilters | `p-4` |
| ThemesTab | `p-6` (modal) |

**Files Affected:**
- `/src/app/markets/page.tsx:103` — `<div className="card p-5 h-full">`
- `/src/app/markets/macro/MacroContent.tsx:152` — `<div className="card p-4">`
- `/src/app/markets/macro/MacroContent.tsx:169` — `<div className="card mb-6 p-5 border-l-4 border-blue-500">`
- `/src/app/markets/gold/GoldContent.tsx:156` — `<div className="card p-6 mb-6 bg-gradient-to-r...">`

**Recommendation:**
Standardize on `p-5` for all cards (good balance), or create card variants:

```css
/* globals.css */
.card {
  @apply bg-white border border-gray-200 rounded-lg p-5 shadow-sm;
}

.card-compact {
  @apply card p-4;
}

.card-spacious {
  @apply card p-6;
}
```

---

## Priority 2: Important (Fix Soon)

### 2.1 Button Style Inconsistency

**Issue:** `btn-primary` and `btn-secondary` are defined in globals.css but not consistently used.

**Files Affected:**
- `/src/components/ThemesTab.tsx:217` — Uses `btn-primary` ✅
- `/src/app/markets/gold/GoldContent.tsx:166-175` — Inline styles ❌
- `/src/components/IBKRPortfolio.tsx:199` — Inline styles ❌
- `/src/components/ResearchForm.tsx` — Inline styles ❌

**Example — GoldContent.tsx (lines 166-175):**
```tsx
// ❌ Inline button styles
<button
  onClick={syncFlows}
  disabled={syncing}
  className="px-4 py-2 bg-amber-100 text-amber-700 rounded-lg text-sm font-medium hover:bg-amber-200 disabled:opacity-50"
>
```

**Recommendation:**
Use utility classes or extend globals.css:

```css
/* Add to globals.css */
.btn-warning {
  @apply bg-amber-100 hover:bg-amber-200 text-amber-700 px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50 transition-colors;
}
```

---

### 2.2 Empty State Inconsistency

**Issue:** Empty states have inconsistent styling.

| Component | Empty State Style |
|-----------|------------------|
| Research page | `bg-white border border-gray-200 rounded-xl p-12 text-center` |
| Projects | `card text-center py-12 text-gray-400` |
| Ideas | `card text-center py-12 text-gray-400` |
| Themes | `card text-center py-12` with icon |
| StockFilters | `bg-white border border-gray-200 rounded-xl p-12 text-center` |

**Files Affected:**
- `/src/app/markets/research/page.tsx:51-58` — Uses `rounded-xl`
- `/src/app/projects/page.tsx:33` — Uses `card` class
- `/src/components/StockFilters.tsx:219-225` — Uses `rounded-xl`

**Note:** `rounded-xl` is not part of the `.card` class (which uses `rounded-lg`).

**Recommendation:**
Create a shared empty state component:

```tsx
// components/EmptyState.tsx
export function EmptyState({ 
  icon, 
  title, 
  description 
}: { 
  icon: string; 
  title: string; 
  description: string 
}) {
  return (
    <div className="card text-center py-12">
      <div className="text-4xl mb-3">{icon}</div>
      <h3 className="text-lg font-semibold text-gray-900 mb-1">{title}</h3>
      <p className="text-sm text-gray-500">{description}</p>
    </div>
  );
}
```

---

### 2.3 Page Header Inconsistency

**Issue:** Some pages have headers with emojis, some don't. Research page has no h1.

| Page | Header |
|------|--------|
| Markets Dashboard | `📊 Stocks Dashboard` |
| Macro | `🌍 Macro Dashboard` |
| Gold | `🥇 Gold Analysis` |
| Research | ❌ No h1 header |
| Portfolio | No visible h1 (handled by IBKRPortfolio) |
| Projects | `All Projects` (no emoji) |
| Ideas | `Ideas Pipeline` (no emoji) |

**Files Affected:**
- `/src/app/markets/research/page.tsx` — Missing h1
- `/src/app/projects/page.tsx:24` — No emoji
- `/src/app/ideas/page.tsx:25` — No emoji

**Recommendation:**
Add consistent headers to all pages:

```tsx
// research/page.tsx - Add header
<div className="mb-6">
  <h1 className="text-2xl font-bold text-gray-900">🔬 Stock Research</h1>
  <p className="text-sm text-gray-500 mt-1">
    Deep-dive analysis reports for individual stocks
  </p>
</div>
```

---

### 2.4 Select Component Usage

**Issue:** ProjectFilters uses native `<select>` while StockFilters uses custom `<Select>` component.

**Files Affected:**
- `/src/components/ProjectFilters.tsx:54-80` — Native `<select>`
- `/src/components/StockFilters.tsx:141-164` — `<Select>` component

**Recommendation:**
Use the `<Select>` component consistently across all filter UIs.

---

## Priority 3: Minor (Nice to Have)

### 3.1 Section Header Typography

**Issue:** Two patterns for section headers:

**Pattern A (uppercase, smaller):**
```tsx
<h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">
```

**Pattern B (normal case, larger):**
```tsx
<h2 className="text-lg font-semibold text-gray-900">
```

**Recommendation:**
Standardize on Pattern A for subsections, Pattern B for main sections.

---

### 3.2 Color Palette Drift

**Issue:** Button colors vary between emerald and blue.

| Context | Color |
|---------|-------|
| Primary actions | `bg-emerald-600` (globals.css) |
| Import button (Portfolio) | `bg-blue-600` |
| Regenerate (Macro) | `bg-blue-600` |

**Recommendation:**
Decide on a single primary color. If blue is for "secondary actions" or "fetch/sync," document this.

---

### 3.3 Modal Backdrop Consistency

**Issue:** Modal backdrops vary slightly.

| Component | Backdrop |
|-----------|----------|
| ThemesTab | `bg-black/50` |
| IBKRPortfolio | `bg-black/50` |
| IdeasPipeline | `bg-black/50` |

All consistent ✅

---

### 3.4 Icon Library

**Issue:** Mix of emoji and Lucide icons.

| Component | Icons Used |
|-----------|------------|
| Dashboard | Emoji (📊, 🔬, 💼) |
| SectorMomentum | Lucide (TrendingUp, RefreshCw) |
| ThemesTab | Lucide (Plus, ChevronDown) |

**Recommendation:**
Document when to use emoji vs Lucide icons (e.g., emoji for high-level categories, Lucide for UI actions).

---

## Tables — Mobile Compliance ✅

All data tables properly use `overflow-x-auto` wrapper:

| Component | Has overflow-x-auto |
|-----------|-------------------|
| ThemesTab | ✅ line 274 |
| SectorMomentum | ✅ line 120 |
| GlobalMarkets | ✅ line 128 |
| IBKRPortfolio | ✅ lines 289, 368, 420 |
| StockFilters | N/A (card grid, not table) |

---

## Error States

**Well-implemented:**
- SectorMomentum — Has error state with retry button
- GlobalMarkets — Has error state with retry button

**Missing explicit error handling:**
- MacroContent — Silently falls back to demo data
- GoldContent — Console.error only
- ThemesTab — Console.error only

**Recommendation:**
Add user-visible error states to all data-fetching components.

---

## Summary of Fixes

### Quick Wins (< 30 min each)
1. ✏️ Replace inline `animate-pulse` loading states with `<Skeleton>` components
2. ✏️ Standardize card padding to `p-5`
3. ✏️ Add h1 header to Research page
4. ✏️ Use `<Select>` component in ProjectFilters

### Medium Effort (1-2 hours)
1. 🔧 Create shared layout for Projects/Ideas pages
2. 🔧 Create `<EmptyState>` component
3. 🔧 Add btn-warning, btn-info utility classes
4. 🔧 Add error states to MacroContent, GoldContent, ThemesTab

### Documentation
1. 📝 Document emoji vs icon usage guidelines
2. 📝 Document primary vs secondary action colors
3. 📝 Create STYLEGUIDE.md with component patterns

---

## Appendix: File References

| File | Lines | Issue |
|------|-------|-------|
| `/src/app/projects/page.tsx` | 18-25 | Layout wrapper |
| `/src/app/ideas/page.tsx` | 18-27 | Layout wrapper |
| `/src/app/markets/macro/MacroContent.tsx` | 135-145 | Inline loading |
| `/src/app/markets/gold/GoldContent.tsx` | 117-127 | Inline loading |
| `/src/app/markets/gold/GoldContent.tsx` | 166-175 | Inline button styles |
| `/src/components/ThemesTab.tsx` | 207-211 | Custom spinner |
| `/src/components/IBKRPortfolio.tsx` | 148-154 | Custom spinner |
| `/src/components/ProjectFilters.tsx` | 54-80 | Native select |
| `/src/app/markets/research/page.tsx` | — | Missing h1 |
