---
name: sw-web
description: "Trigger: React component, web feature, page, hook, query, Tailwind, shadcn, frontend, UI. Smart-wallet web frontend patterns."
license: MIT
metadata:
  author: smart-wallet
  version: "1.0"
---

## Activation Contract

Load when writing any code under `packages/web/src/`.

## Hard Rules

- **Feature-based structure**: all code for a domain lives in `features/{domain}/` — pages, components, hooks, queries
- **No hardcoded strings in JSX** — use `t.*` from `lib/i18n.ts` for all user-facing text
- **Money formatting**: always `formatCurrency(cents, currency)` from `lib/currency.ts` — never manual formatting
- **import type** for type-only imports — enforced by ESLint (`@typescript-eslint/consistent-type-imports`)
- **shadcn/ui components** in `components/ui/` — use as-is, never modify internals; extend via className only
- **Common components** in `components/common/` — use `ColorBlock`, `Eyebrow`, `PageHeader`, `EmptyState`, `ErrorState`
- Web never imports from `@smart-wallet/domain` or `@smart-wallet/api` — only `@smart-wallet/shared-types`
- Vite env vars (`VITE_*`) are baked at build time — no runtime env access in browser code

## Feature Structure

```
features/{domain}/
  pages/          ← route-level components, fetch data via hooks
  components/     ← presentational, props only, no API calls
  hooks/          ← custom hooks (useX)
  queries.ts      ← React Query mutations/queries (useQuery, useMutation)
  {domain}Api.ts  ← raw fetch functions called by queries.ts
```

## Component Pattern

```tsx
// Page: owns data fetching, passes props down
export const MyPage = () => {
  const { data, isLoading, isError } = useMyData();
  if (isLoading) return <MySkeleton />;
  if (isError) return <ErrorState message={t.errors.generic} onRetry={...} />;
  return <MyComponent data={data} />;
};

// Component: pure, no API calls
interface MyComponentProps { data: MyData }
export const MyComponent = ({ data }: MyComponentProps) => { ... };
```

## Tailwind Conventions

- Design system defined in `DESIGN.md` — monochrome core + pastel `block-*` accent colors
- Pill-shaped CTAs, `font-mono` for labels/eyebrows, `tracking-display` for headings
- `ColorBlock` tone prop: `'navy'` | `'cream'` | `'lime'` — use instead of raw bg colors
- `Eyebrow` component for small uppercase section labels

## Decision Gates

| Need | Solution |
|------|----------|
| Server state (API data) | React Query via `queries.ts` |
| Client UI state | `useState` / `useReducer` in the page |
| Shared state across features | Context in `app/Providers.tsx` |
| New route | Add to `app/routes.ts` and `app/AppRouter.tsx` |
| New shadcn component | `npx shadcn add {component}` — never copy-paste manually |
