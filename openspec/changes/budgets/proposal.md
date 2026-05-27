# Budgets — Proposal

## 1. Intent

Permitir al usuario definir **presupuestos mensuales** (por categoría o globales por moneda) y ver en tiempo real cuánto lleva gastado vs. el límite, con rollover opcional del sobrante del mes anterior. Hoy no hay forma de ponerse un techo de gasto; el dashboard solo muestra lo que ya pasó. Esto cierra el loop "set a limit → track against it".

## 2. Scope

### In

- **Entidad de dominio** `Budget` con dos tipos: `per_category` (un `categoryId`) y `global` (todas las expenses en una currency).
- **Período fijo mensual** (mes calendario UTC). No semanal, no custom.
- **Flag `rollover: boolean`**: si `true`, `effectiveLimit = limit + max(0, prevLimit - prevSpent)`. Computado a read time, sin job.
- **4 endpoints CRUD**:
  - `POST /budgets` — crear
  - `GET /budgets` — listar con `spentCents` + `effectiveLimitCents` del mes actual
  - `PATCH /budgets/:id` — editar (límite, rollover; tipo/categoría/currency inmutables)
  - `DELETE /budgets/:id` — eliminar
- **Pantalla `/budgets`** con lista de cards (progress bar verde/amarillo/rojo), Create/Edit form, Delete dialog. Item nuevo en Sidebar/BottomTabBar.
- **Nuevo método en `TransactionRepository`**: `sumExpensesByPeriod(userId, { from, to, currency, categoryId? })` retorna integer cents. Branch por presencia de `categoryId`.
- **Strings** en español neutro vía `t.budgets`.

### Out

- **Sin períodos no mensuales** (semanal, anual, custom). Aditivo si después se necesita.
- **Sin notificaciones/alertas** al cruzar 80% o 100%. Solo color visual.
- **Sin presupuestos compartidos entre usuarios** (multi-tenant).
- **Sin histórico de presupuestos pasados** — el mes corriente se computa on-the-fly; no se guarda snapshot mensual.
- **Sin contador materializado** (`spentCents` en el item) — read-time sum es lo correcto.
- **Sin nuevo GSI**. La query de "global" usa partition scan con FilterExpression.
- **Sin tests**, consistente con el resto del repo.
- **Sin endpoint GET /budgets/:id** — la lista ya trae todo (CRUD lite).

## 3. Approach

**Hexagonal estándar**: `Budget` aggregate (con `create` validando + `rehydrate` confiando, `Result<T,E>`), `BudgetRepository` port en domain, `DynamoDBBudgetRepository` en api. Single-table: `PK=USER#<userId>` / `SK=BUDGET#<budgetId>`. Sin GSI nuevo — `Query` con `begins_with(SK, 'BUDGET#')` cubre el listado.

**Cálculo de gasto** delegado a `transactionRepo.sumExpensesByPeriod`:

- **per_category**: GSI1 `GSI1SK BETWEEN 'CAT#<cid>#<from>' AND 'CAT#<cid>#<to>~'` + FilterExpression `type=expense AND currency=:c`.
- **global**: PK partition + `begins_with(SK, 'TXN#')` + FilterExpression `occurredAt BETWEEN ... AND type=expense AND currency=:c`.
- **Drain obligatorio** (DDB `Limit` aplica antes que FilterExpression).

**Rollover** computado en `ListBudgets`: por cada budget con `rollover=true`, una query extra al mes anterior. N+1 queries paralelas (Promise.all). Para 5-15 budgets típicos es trivial.

**Frontend** sigue el patrón de `recurring`/`categories`: feature folder con `pages/`, `components/`, `queries.ts`, `budgetsApi.ts`. Progress bar puramente presentacional. React Query para cache.

## 4. Affected Areas

| Área                                                                               | Impacto            | Detalle                                                         |
| ---------------------------------------------------------------------------------- | ------------------ | --------------------------------------------------------------- |
| `packages/domain/src/budget/*`                                                     | New (~9 archivos)  | Entity, error, repo iface, 4 use cases                          |
| `packages/domain/src/transaction/TransactionRepository.ts`                         | Modified           | + `sumExpensesByPeriod`                                         |
| `packages/api/src/adapters/dynamodb/repositories/DynamoDBBudgetRepository.ts`      | New                | CRUD sobre PK/SK                                                |
| `packages/api/src/adapters/dynamodb/repositories/DynamoDBTransactionRepository.ts` | Modified           | Implementa `sumExpensesByPeriod` (branch per-cat/global)        |
| `packages/api/src/adapters/dynamodb/mappers/BudgetMapper.ts`                       | New                | toItem/fromItem con `rehydrate`                                 |
| `packages/api/src/adapters/dynamodb/keyBuilders.ts`                                | Modified           | + `budgetSK`, `budgetSKPrefix`                                  |
| `packages/api/src/handlers/budget/*`                                               | New (4)            | create/list/update/delete con `withErrorHandler(withAuth(...))` |
| `packages/api/src/composition/container.ts`                                        | Modified           | Wire budget use cases                                           |
| `packages/infra-sls/src/handlers/budget/*` + `serverless.yml`                      | New (4) + Modified | Proxy re-exports + 4 rutas                                      |
| `packages/shared-types/src/schemas/budget.ts` + `index.ts`                         | New + Modified     | Zod request/response schemas                                    |
| `packages/web/src/features/budgets/*`                                              | New (7)            | Pages, components, queries, api client                          |
| `packages/web/src/app/{routes,AppRouter}.ts` + `lib/i18n.ts`                       | Modified           | Rutas + nav + strings                                           |

## 5. Key Decisions

| Decisión                            | Elegido                                 | Alternativa                                  | Razón                                                              |
| ----------------------------------- | --------------------------------------- | -------------------------------------------- | ------------------------------------------------------------------ |
| Cálculo de spent                    | Server-side sum en `ListBudgets`        | Materializado en el item / drain client-side | Correcto, simple, sin coupling de transacciones a budgets          |
| Schema DDB                          | `SK=BUDGET#<id>`, sin GSI nuevo         | GSI2 `TYPE#expense`                          | YAGNI; el FilterExpression aguanta el MVP                          |
| Período                             | Mes calendario fijo (UTC)               | Configurable / sliding window                | MVP simple; aditivo si después se pide                             |
| Rollover                            | Read-time, prev month diff              | Persisted counter con cron                   | Sin infra extra, sin race conditions, datos pasados son inmutables |
| Currency                            | Obligatorio en el budget, filtro en sum | Multi-currency en un budget                  | Alineado con `Money` VO y wallets currency-aware                   |
| Tipo/categoría/currency post-create | Inmutables                              | Editables con migración                      | Cambiar el alcance del budget es realmente "crear otro"            |
| Delivery                            | Chained PRs (domain → api → web)        | Single PR con `size:exception`               | ~35 nuevos + ~10 modificados supera holgadamente las 400 LOC       |

## 6. Risks

| Risk                                                        | Likelihood          | Mitigation                                                       |
| ----------------------------------------------------------- | ------------------- | ---------------------------------------------------------------- |
| N+1 queries en `ListBudgets` con rollover (≤2N DDB queries) | Med                 | Promise.all; tope práctico de budgets por usuario es chico (~15) |
| Global budget scan lee income innecesariamente (RCU waste)  | Med                 | Aceptado MVP; futuro GSI2 si métricas lo justifican              |
| Drain incompleto si se olvida loop sobre `LastEvaluatedKey` | Alta si se descuida | Documentar en el adapter + helper compartido                     |
| Time-zone drift al definir "mes calendario"                 | Baja                | Usar UTC siempre; mismo criterio que dashboard mensual           |
| Chained PRs introducen fricción de rebase                   | Med                 | Branch chain feature → domain → api → web; rebase secuencial     |

## 7. Rollback Plan

1. **Web**: revertir las rutas `/budgets*` y remover el item del nav. Sin impacto en otros features.
2. **API**: remover las 4 rutas del `serverless.yml` y re-deploy. Los items `BUDGET#*` quedan huérfanos en DDB pero son inertes (no los lee nadie).
3. **Domain**: revert del paquete; el método `sumExpensesByPeriod` en `TransactionRepository` puede quedarse sin uso (no rompe nada).
4. **Datos**: borrar items huérfanos con un script puntual `DeleteItem` por `begins_with(SK, 'BUDGET#')` si se quiere limpieza total. No urgente.

## 8. Success Criteria

- [ ] Usuario puede crear un budget per-category y otro global, verlos en la lista con barra de progreso reflejando gastos reales del mes.
- [ ] Rollover suma correctamente el sobrante del mes previo cuando el flag está activo.
- [ ] PATCH actualiza `limitCents` y `rollover`; tipo/categoría/currency rechazados.
- [ ] DELETE remueve el budget; sus transacciones quedan intactas.
- [ ] Listado responde en < 800ms p95 para usuarios con ≤15 budgets.
- [ ] Cero cambios al `Transaction` aggregate ni a sus mappers.

## 9. Capabilities

### New

- `budgets`: aggregate `Budget`, repo, 4 use cases CRUD, endpoints y UI para presupuestos mensuales con rollover opcional.

### Modified

- `transactions`: `TransactionRepository` gana `sumExpensesByPeriod(userId, { from, to, currency, categoryId? })`. No cambia el modelo de `Transaction`.

## 10. Open Questions

Ninguna. Exploración cerrada con respuestas a las 6 preguntas clave (ver `explore.md` / Engram `sdd/budgets/explore`).
