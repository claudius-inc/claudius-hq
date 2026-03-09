# HQ Style Guide

## Hero Sections

All page hero sections must use the `PageHero` component from `@/components/PageHero`.

### Required Pattern
```tsx
import { PageHero } from "@/components/PageHero";

// In your component:
<PageHero
  title="Page Title"
  subtitle="Brief description or stats"
/>
```

### Rules
- **No icons before titles** — titles are clean text only
- **Consistent styling** — `PageHero` handles responsive design, typography, and spacing
- **Actions support** — use `actions` prop for page-level buttons (e.g., "Add Item", "Refresh")
- **Custom slots** — use `actionSlot` for complex custom action areas

### PageHero Props
```typescript
interface PageHeroProps {
  title: string;
  subtitle?: string;
  badge?: ReactNode;           // Optional status badge next to subtitle
  actions?: PageHeroAction[];  // Action buttons (collapsed to menu on mobile)
  actionSlot?: ReactNode;      // Custom action area (replaces actions)
}
```

### Examples

**Simple hero:**
```tsx
<PageHero
  title="Offerings"
  subtitle="15 active of 20 total"
/>
```

**With actions:**
```tsx
<PageHero
  title="Tasks"
  subtitle="5 pending"
  actions={[
    { label: "Add Task", onClick: handleAdd, variant: "primary" },
    { label: "Refresh", onClick: handleRefresh },
  ]}
/>
```

**With custom slot:**
```tsx
<PageHero
  title="Dashboard"
  subtitle="Real-time overview"
  actionSlot={<ServerStatus isRunning={true} />}
/>
```

## ACP Pillars

Valid pillar values: `quality`, `replace`, `build`, `experiment`, `distribute`

Use `AcpPillarBadge` component for displaying pillars consistently.
