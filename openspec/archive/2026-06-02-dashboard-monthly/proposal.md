# Dashboard mensual — Proposal

## 1. Intent

Dar al usuario una vista de overview con el resumen del mes en curso (MTD, mes a la fecha): cuánto tiene, cuánto ingresó, cuánto gastó, balance del mes, y en qué categorías está gastando más. Hoy la app abre directamente en la lista de billeteras y el usuario tiene que mentalmente sumar para entender su situación.

## 2. Scope

### In

- **Nueva ruta `/dashboard`** protegida, dentro del shell `AppLayout`.
- **Home redirige a `/dashboard`** (antes redirigía a `/wallets`). Wallets queda accesible en su propia ruta.
- **Nav item** "Resumen" en `Sidebar` (desktop) y `BottomTabBar` (mobile), como primer item.
- **DashboardPage** con 4 secciones:
  1. **Balance total por moneda** — suma de `wallet.balance` agrupada por `currency`. Si el usuario tiene wallets en USD y PEN, muestra dos sub-totales separados. NO se convierte entre monedas.
  2. **Resumen del mes (MTD)** — 3 cards: Ingresos, Gastos, Balance del mes. Cada card filtra por la moneda preferida del usuario (`usePreferredCurrency`); si no hay preferida, cae al currency de la primera wallet. Hay un selector pequeño para cambiar la moneda mostrada cuando hay wallets de más de una moneda.
  3. **Top 3 categorías del mes** — lista de las 3 categorías con mayor gasto absoluto en el mes en curso, con monto y % del total de gastos. Solo gastos (no ingresos). En la moneda mostrada.
  4. **CTA "Agregar movimiento"** — Botón promo que va a `/transactions/new`.
- **Strings** en español neutro (sin voseo) en `i18n.ts`.

### Out

- **Sin backend nuevo.** Toda la agregación es client-side leyendo de los endpoints existentes (`GET /wallets`, `GET /wallets/:id/transactions?from&to`).
- **Sin charts/gráficos.** Solo cards y números. Si después molesta, se agregan en un SDD aparte.
- **Sin selector de período.** Solo "este mes" (1° del mes hasta hoy 23:59). Períodos custom van a un SDD aparte.
- **Sin conversión de monedas** (FX). Si hay USD y PEN, se muestran separados.
- **Sin recurrentes/forecast/proyecciones.** Es un resumen pasado/presente, no proyectivo.
- **Sin export CSV/PDF** del resumen.
- **Sin caché especial.** Usa React Query con la `staleTime` por defecto; cuando el usuario crea una tx, las invalidations existentes la refrescan.

## 3. Approach

### Datos

1. `useWallets()` → devuelve todas las wallets del usuario con `balance` ya calculado por el backend.
2. Para cada wallet, `useWalletTransactions(walletId, { from, to })` con `from = primer día del mes (00:00:00.000 ISO)` y `to = ahora`. La key del React Query incluye los filtros, así que ya cachea por mes.
3. Un hook agregador `useMonthlyDashboard()` orquesta las queries paralelas, recibe la moneda mostrada como input, y devuelve:
   ```ts
   {
     totalsByCurrency: Map<Currency, string>,   // balance total por moneda
     monthlyIncome: string,
     monthlyExpenses: string,
     monthlyNet: string,
     topCategories: Array<{ categoryId: string; amount: string; share: number }>,
     isLoading: boolean,
     isError: boolean,
   }
   ```
   Sumas en decimal usando `lib/decimal.ts` (o equivalente helper existente) para evitar float drift.
4. Lookup de nombres de categorías: combina `useCategories()` (custom) + `PREDEFINED_CATEGORIES` (shared-types) para mapear `categoryId → { name, color }`.

### Estructura de archivos

- `packages/web/src/features/dashboard/` (nuevo)
  - `pages/DashboardPage.tsx`
  - `hooks/useMonthlyDashboard.ts`
  - `lib/aggregation.ts` (funciones puras: `sumByCurrency`, `splitIncomeExpense`, `topCategoriesByAmount`, `monthBoundaries`)
  - `components/BalanceCard.tsx`
  - `components/MonthlyStatsCard.tsx`
  - `components/TopCategoriesCard.tsx`
  - `components/CurrencyToggle.tsx` (solo si hay >1 moneda en las wallets)

### Layout (mobile-first, mismo shell `AppLayout`)

```
PageHeader: "Resumen" / Mayo 2026
BalanceCard (full width)
  └─ Subgrid de tiles, uno por moneda
[ CurrencyToggle (solo si hay >1 moneda) ]
Stats grid (3 cards):
  Ingresos del mes
  Gastos del mes
  Balance del mes
TopCategoriesCard (lista de hasta 3 ítems)
CTA Agregar movimiento
```

### Routing

- `routes.dashboard = '/dashboard'`
- `routes.home = '/'` → ahora redirige a `routes.dashboard` (antes a `routes.wallets`).
- `Sidebar.navItems` y `BottomTabBar` agregan "Resumen" como primer item con ícono `LayoutGrid` o `Home`.

### i18n (sección nueva en `t.dashboard`)

- `title: 'Resumen'`
- `eyebrow: 'Este mes'`
- `totalBalance: 'Balance total'`
- `monthlyIncome: 'Ingresos del mes'`
- `monthlyExpenses: 'Gastos del mes'`
- `monthlyNet: 'Balance del mes'`
- `topExpenses: 'Top categorías'`
- `noExpensesYet: 'Aún no hay gastos este mes'`
- `noWallets: 'Crea tu primera billetera para ver tu resumen'`

## 4. Key decisions

| Decisión            | Elegido                                          | Alternativa                          | Razón                                                                                                                                                      |
| ------------------- | ------------------------------------------------ | ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Backend nuevo?      | NO, agregación client-side                       | `GET /reports/monthly`               | MVP simple. Con pocos wallets y bajo volumen de tx, el costo es bajo. Si después molesta la latencia, se hace SDD aparte para el endpoint dedicado.        |
| Multi-currency      | Mostrar separado, sin conversión                 | Conversión a moneda preferida con FX | FX requiere infra externa (tasa de cambio). MVP simple no la asume.                                                                                        |
| Selector de período | No (solo "este mes")                             | Selector mes/año                     | YAGNI hoy.                                                                                                                                                 |
| Home redirect       | A `/dashboard`                                   | Dejar `/wallets`                     | Dashboard es la vista de overview natural; el usuario al abrir la app prefiere ver el resumen antes que la lista cruda. Wallets sigue accesible en su tab. |
| Caché               | React Query default                              | Caché custom                         | Las invalidations en mutaciones existentes (`add/update/delete transaction`) ya invalidan `transactions.all`, que cubre las queries por mes filtradas.     |
| Componentes         | Reutilizar `ColorBlock`, `Eyebrow`, `PageHeader` | Nuevos                               | Mantiene consistencia con el sistema editorial actual.                                                                                                     |

## 5. Risks

- **Latencia con muchas wallets**: Si el usuario tiene N wallets, hace N requests paralelos. Con N≤5 (caso esperado) es trivial. Si crece, se considera endpoint dedicado.
- **Paginación de transacciones**: Si una wallet tiene cientos de tx en un mes, el infinite query solo trae la primera página. El hook debe pedir todas las páginas (`fetchNextPage` hasta agotar) antes de agregar — esto se hace en `useMonthlyDashboard`. Alternativa: usar `useQuery` (no infinite) con `limit` alto. **Decisión**: pedir todas las páginas; aceptable para volumen MVP.
- **Mes a caballo de timezone**: El frontend calcula `from/to` en local time del browser. Coherente con cómo se muestran las fechas en el resto de la app.

## 6. Out of scope / future work

- Endpoint backend `GET /reports/monthly` para precomputar el resumen y reducir requests.
- Charts (donut por categoría, barras por día).
- Comparación mes anterior / promedio.
- Selector de período custom.
- Conversión multi-currency con FX.
- Export del resumen.

## 7. LOC estimate

~450–600 LOC en una sola PR. Bajo el budget de 800; sin chained PRs.

| Área                                                     | LOC aprox |
| -------------------------------------------------------- | --------- |
| `features/dashboard/` (page + hook + lib + 4 components) | ~320      |
| `app/routes.ts` + `AppRouter.tsx`                        | ~10       |
| `components/layout/Sidebar.tsx` + `BottomTabBar.tsx`     | ~25       |
| `lib/i18n.ts` (sección nueva)                            | ~20       |
| Decimal helper (si no existe)                            | ~30       |
| `lib/decimal.ts` reuso / formatCurrency                  | 0         |
| Tests si aplica (none in MVP per cached strategy)        | 0         |
| Total                                                    | **~405**  |

## 8. Open questions (none — MVP scope locked)

Listo para spec.
