# Claudius HQ — Style Guide

## Philosophy

Keep it simple. Black, white, and grays for most UI. Use color sparingly and with purpose.

---

## Colors

### Text Colors

| Token | Tailwind | Usage |
|-------|----------|-------|
| **Primary text** | `text-gray-900` | Headings, important values, primary content |
| **Secondary text** | `text-gray-600` | Labels, descriptions, supporting content |
| **Muted text** | `text-gray-500` | Timestamps, captions, helper text |
| **Subtle text** | `text-gray-400` | Placeholders, disabled states, de-emphasized |
| **Positive** | `text-emerald-600` | Gains, success, positive changes |
| **Negative** | `text-red-600` | Losses, errors, negative changes |
| **Warning** | `text-amber-600` | Caution, elevated states |
| **Link / Interactive** | `text-emerald-600 hover:text-emerald-700` | Links, clickable elements |

**Do NOT use:** `text-green-*` (use `emerald`), `text-gray-700` for body text (use `gray-600`), `text-gray-800` (use `gray-900` or `gray-600`).

### Background Colors

| Token | Tailwind | Usage |
|-------|----------|-------|
| **Page background** | `bg-gray-50` | Set on `<body>` |
| **Card background** | `bg-white` | Cards, panels, modals |
| **Subtle background** | `bg-gray-50` | Table rows, hover states, sections |
| **Hover** | `hover:bg-gray-100` | Interactive row/cell hover |
| **Active/Selected** | `bg-gray-100` | Active tabs, selected items |
| **Positive badge** | `bg-emerald-50` or `bg-emerald-100` | Success states, positive indicators |
| **Negative badge** | `bg-red-50` or `bg-red-100` | Error states, negative indicators |
| **Warning badge** | `bg-amber-50` or `bg-amber-100` | Caution indicators |
| **Info badge** | `bg-blue-50` or `bg-blue-100` | Neutral informational badges |

### Status Badge Colors (consistent pairing)

| State | Background | Text |
|-------|-----------|------|
| **Positive / Healthy** | `bg-emerald-100` | `text-emerald-700` |
| **Warning / Elevated** | `bg-amber-100` | `text-amber-700` |
| **Negative / Critical** | `bg-red-100` | `text-red-700` |
| **Neutral / Info** | `bg-blue-100` | `text-blue-700` |
| **Default / Inactive** | `bg-gray-100` | `text-gray-700` |

### Borders

| Usage | Tailwind |
|-------|----------|
| **Card border** | `border-gray-200` |
| **Divider** | `border-gray-100` or `border-gray-200` |
| **Input focus** | `focus:ring-emerald-500 focus:border-emerald-500` |

---

## Typography

### Font Sizes

| Element | Tailwind | Weight |
|---------|----------|--------|
| **Page title** | `text-2xl` | `font-bold` |
| **Section heading** | `text-lg` | `font-semibold` |
| **Card title** | `text-sm uppercase tracking-wider` | `font-semibold` |
| **Body text** | `text-sm` | `font-normal` |
| **Table cell** | `text-sm` | `font-normal` or `font-medium` for emphasis |
| **Small text / Caption** | `text-xs` | `font-normal` or `font-medium` |
| **Badge text** | `text-xs` | `font-medium` |
| **Micro text** | `text-[10px]` | `font-medium` — use sparingly (legend labels only) |

**Do NOT use:** `text-base` (use `text-sm`), `text-3xl` or `text-4xl` (use `text-2xl` max), `font-extrabold`.

### Font Weight Rules

- `font-bold` — Page titles only
- `font-semibold` — Section headings, important values (portfolio totals, prices)
- `font-medium` — Labels, table headers, badge text, button text
- `font-normal` — Body text, table cells, descriptions

---

## Spacing

| Element | Pattern |
|---------|---------|
| **Page padding** | `px-4 py-6` |
| **Card padding** | `p-4` or `p-5` |
| **Section gap** | `space-y-6` or `gap-6` |
| **Card internal gap** | `space-y-3` or `space-y-4` |
| **Table cell padding** | `px-4 py-2` or `px-4 py-3` |

---

## Components

### Cards

```tsx
// Standard card
<div className="card">...</div>  // bg-white border border-gray-200 rounded-lg p-4 shadow-sm

// Hoverable card (links)
<div className="card-hover">...</div>  // + hover:border-gray-300 hover:shadow-md
```

### Buttons

```tsx
// Primary action
<button className="btn-primary">Save</button>  // bg-emerald-600 text-white

// Secondary action
<button className="btn-secondary">Cancel</button>  // bg-gray-100 text-gray-700

// Destructive
<button className="bg-red-600 hover:bg-red-500 text-white px-4 py-2 rounded-md font-medium">Delete</button>

// Ghost/icon button (44px touch target)
<button className="p-2 -m-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg touch-manipulation">
  <Icon className="w-4 h-4" />
</button>
```

### Badges / Status Pills

```tsx
<span className="status-badge bg-emerald-100 text-emerald-700">Healthy</span>
<span className="status-badge bg-amber-100 text-amber-700">Warning</span>
<span className="status-badge bg-red-100 text-red-700">Critical</span>
<span className="status-badge bg-gray-100 text-gray-700">Default</span>
```

### Inputs

```tsx
<input className="input" />  // px-3 py-2 text-sm border rounded-lg focus:ring-emerald-500
```

### Tables

```tsx
<div className="overflow-x-auto">
  <table className="w-full">
    <thead>
      <tr className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
        <th className="px-4 py-3">Column</th>
      </tr>
    </thead>
    <tbody className="divide-y divide-gray-100">
      <tr className="hover:bg-gray-50">
        <td className="px-4 py-3 text-sm text-gray-900">Value</td>
      </tr>
    </tbody>
  </table>
</div>
```

### Empty States

```tsx
<EmptyState
  icon={<Icon className="w-6 h-6" />}
  title="No items yet"
  description="They'll appear here once created."
/>
```

---

## Financial Data Colors

For P&L, price changes, and percentage movements:

```tsx
// Positive values
className={value >= 0 ? "text-emerald-600" : "text-red-600"}

// With background (table cells, badges)
className={value >= 0 ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-600"}
```

**Always use `emerald` for positive, `red` for negative. Never use `green`.**

---

## Layout

- **Max width:** `max-w-6xl mx-auto`
- **Page structure:** `<Nav />` + `<main className="max-w-6xl mx-auto px-4 py-6">`
- **Grid:** `grid grid-cols-1 md:grid-cols-2 gap-6` (2-col default)
- **Full-width sections:** `md:col-span-2`

---

## Don'ts

- No emojis in the web UI (use lucide-react icons)
- No `text-green-*` (use `text-emerald-*`)
- No `text-gray-700` or `text-gray-800` for body (use `gray-600` or `gray-900`)
- No `text-base` (use `text-sm`)
- No `font-extrabold`
- No custom colors outside the palette above
- No `text-[10px]` except for legend/micro labels
- No inline styles
