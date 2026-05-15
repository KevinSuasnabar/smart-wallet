# Recurring monthly — Proposal

## 1. Intent

Permitir al usuario definir movimientos que se repiten mensualmente (sueldo, alquiler, Netflix, etc.) para que el sistema los materialice automáticamente cuando el usuario abre el dashboard. "Set and forget": el usuario define una vez, la app crea las transacciones reales en su día.

## 2. Scope

### In

- **Nueva entidad de dominio** `RecurringTransaction` con cadence fija `'monthly'`.
- **5 endpoints CRUD** + **1 endpoint de materialización**:
  - `POST /recurring` — crear recurring
  - `GET /recurring` — listar recurrings del usuario
  - `GET /recurring/:id` — detalle
  - `PATCH /recurring/:id` — editar (campos editables: `dayOfMonth`, `amount`, `categoryId`, `description`)
  - `DELETE /recurring/:id` — eliminar (NO afecta transacciones ya materializadas)
  - `POST /recurring/materialize` — materializa todas las pendientes del usuario (idempotente por `ConditionExpression` sobre `nextOccurrenceAt`)
- **Auto-trigger** desde `DashboardPage`: en el `useEffect` de mount, llamada a `POST /recurring/materialize` que se ejecuta antes (o en paralelo) con la agregación del mes. Las wallets/tx se invalidan al terminar para que el dashboard refleje los nuevos movimientos.
- **Nueva pantalla `/recurring`** con lista + acciones Create/Edit/Delete. Item del Sidebar y BottomTabBar.
- **Día del mes**: campo `dayOfMonth: 1..31`. Si el mes destino tiene menos días (Feb 30 → 28/29), se clampa al último día del mes.
- **Strings** en español neutro.

### Out

- **Sin cadencias semanales, diarias, anuales o custom.** Solo mensual. Si después molesta, se agrega un campo `cadence` y se extiende.
- **Sin EventBridge/cron.** La materialización vive en la request del dashboard, no en infra schedulada.
- **Sin `endsAt`/`occurrencesRemaining`.** Las recurrings corren hasta que el usuario las elimina.
- **Sin pausar/reactivar (isActive flag).** Para pausar, el usuario elimina y recrea (acepta perder el contador de "última materialización").
- **Sin notificaciones/recordatorios.** Solo la materialización silenciosa.
- **Sin link reverso desde la transacción** (la tx materializada NO guarda `recurringId`). Decisión: MVP no necesita auditoría, y deja la tx independiente del lifecycle de la recurring.
- **Sin tests**, consistente con el resto del paquete.
- **Sin cambio en el modelo de Transaction** (la tx materializada se crea con los mismos campos que una manual; no se diferencia).

## 3. Approach

### Dominio

`RecurringTransaction` aggregate root:
- `recurringId: RecurringTransactionId` (UUID)
- `userId: UserId`
- `walletId: WalletId` (inmutable post-creación)
- `type: 'income' | 'expense'` (inmutable)
- `amount: Money` (inmutable currency, editable magnitude)
- `currency: Currency` (inmutable; debe coincidir con la wallet)
- `categoryId: CategoryId` (editable; debe matchear `type`)
- `description?: string` (editable, max 256)
- `cadence: 'monthly'` (literal)
- `dayOfMonth: 1..31`
- `nextOccurrenceAt: ISO8601 UTC`
- `lastMaterializedAt: ISO8601 UTC | null`
- `createdAt`, `updatedAt`

Métodos:
- `static create(props, clock): Result<RecurringTransaction, Error>` — valida y calcula `nextOccurrenceAt` como el próximo día del mes ≥ hoy.
- `applyEdits(edits, clock): Result<void, Error>` — patrón existente (snapshot rollback en validación fallida).
- `materialize(now: Date): { transaction: TransactionDraft; nextOccurrenceAt: string }` — devuelve la tx a crear y la próxima fecha, sin tocar repo.

### Repositorio

```ts
interface RecurringTransactionRepository {
  create(input): Promise<void>
  findById(userId, recurringId): Promise<RecurringTransaction | null>
  listByUser(userId): Promise<RecurringTransaction[]>
  listPending(userId, now: Date, limit: number): Promise<RecurringTransaction[]>
  update(input): Promise<void>
  hardDelete(input): Promise<void>
  materializeOne(recurring, tx, walletDelta, nextOccurrenceAt): Promise<void>
  // ↑ TransactWriteItems: Put tx + Update wallet + Update recurring,
  //   condicionando la Update de recurring a nextOccurrenceAt = :expected
  //   (optimistic lock anti race).
}
```

### Use cases

- `MakeCreateRecurring(deps)` — valida wallet, categoría (existe + type match), construye y persiste
- `MakeListRecurring(deps)` — listByUser, devuelve descriptors
- `MakeGetRecurring(deps)` — findById
- `MakeUpdateRecurring(deps)` — load + applyEdits + persist; valida categoría si cambia
- `MakeDeleteRecurring(deps)` — hardDelete
- `MakeMaterializeRecurrings(deps)` — loop: `listPending` → `materialize` cada uno → repetir hasta vacío o cap (50 iter)

### DynamoDB

- PK `USER#{userId}` (igual que el resto)
- SK `RECURRING#{recurringId}` para el item principal
- GSI1: `GSI1PK = USER#{userId}`, `GSI1SK = RECURNEXT#{nextOccurrenceAt}#{recurringId}` — permite query `KeyConditionExpression: GSI1PK = :pk AND GSI1SK <= :max` para listar pendientes ordenadas por fecha.

`materializeOne` es un único `TransactWriteItems` con 3 ops:
1. `Put` Transaction (mismo formato que add transaction normal)
2. `Update` Wallet balance (signed delta)
3. `Update` Recurring (set `nextOccurrenceAt`, `lastMaterializedAt`, bump `updatedAt`, condition `nextOccurrenceAt = :expected`)

Si el condition falla, la materialización de esa recurring se aborta silenciosamente — significa que otro request ya la materializó.

### Materialización del mes

Algoritmo del use case `MakeMaterializeRecurrings`:

```
let totalMaterialized = 0
for safety in 0..50:
  pending = repo.listPending(userId, now, limit=20)
  if pending.empty: break
  for each r in pending:
    nextAt = nextDayOfMonthOnOrAfter(r.nextOccurrenceAt + 1 month, r.dayOfMonth)
    repo.materializeOne(r, draftTx(r, now), signedDelta, nextAt)
    totalMaterialized++
return totalMaterialized
```

Para recurrings atrasadas N meses, el loop las materializa N veces (porque después de cada materialización su `nextOccurrenceAt` sigue ≤ now). El cap de 50 iter × 20 items = 1000 materializaciones máx por request. Suficiente para usuarios humanos.

### Frontend

- `packages/web/src/features/recurring/`
  - `pages/RecurringListPage.tsx`
  - `pages/CreateRecurringPage.tsx`
  - `pages/EditRecurringPage.tsx`
  - `components/RecurringForm.tsx`
  - `components/RecurringListItem.tsx`
  - `components/DeleteRecurringDialog.tsx`
  - `recurringApi.ts`, `queries.ts`
- `routes.ts`: `recurring: '/recurring'`, `recurringNew: '/recurring/new'`, `recurringEdit: (id) => …`
- Sidebar/BottomTabBar: nuevo item "Recurrentes" con ícono `Repeat`.
- DashboardPage: `useEffect(() => { void materialize(); }, [])` con `useRef` para evitar dobles llamadas en StrictMode dev. Invalida wallets + transactions on success.
- I18n: nueva sección `t.recurring`.

### Idempotencia y race conditions

- **Dos tabs abren dashboard al mismo tiempo**: dos `POST /recurring/materialize` simultáneos. Ambos hacen `listPending` y traen los mismos N recurrings. Ambos intentan `TransactWrite` con `ConditionExpression nextOccurrenceAt = :expected`. Solo uno gana; el otro recibe `ConditionalCheckFailedException` y la repo lo trata como "ya materializado, sigue con el próximo". No se duplican tx.
- **Idempotency-Key NO se requiere** en `POST /recurring/materialize` (el server-side condition lock cubre la duplicación). Si el frontend reintenta tras error de red, vuelve a pedir `listPending` y opera sobre lo que quedó.

## 4. Key decisions

| Decisión | Elegido | Alternativa | Razón |
|---|---|---|---|
| Cadence | Solo `'monthly'` literal | Enum mensual/semanal/diario/custom | MVP simple. Extender es cambio aditivo (campo nuevo + branch en `materialize`). |
| Materialización | On-demand al abrir dashboard | EventBridge cron diaria | Sin infra change, sin coste fijo, predecible (el usuario ve resultados YA al abrir). |
| Day of month | `1..31` con clamp | `1..28` rígido | UX: la mayoría de sueldos/alquileres caen entre 28-30. Clamp a último día del mes (Feb 30 → 28/29) es estándar y no introduce drift acumulado. |
| Atomicidad | TransactWriteItems con condition lock | Saga de 3 ops separadas | Atomicidad transaccional y race-safety en una sola llamada DDB. |
| Link tx→recurring | NO guardar `recurringId` en la tx | Guardar para auditoría | YAGNI. Si después se necesita, es migration aditiva. |
| Pause/active | Eliminar y recrear | Flag `isActive` | UX más simple, menos branches. Se puede agregar. |
| Endpoint scope | Top-level `/recurring/*` | Anidado `/wallets/:walletId/recurring/*` | El usuario gestiona recurrings como lista global (igual que `/categories`); la wallet es un atributo no una jerarquía. |
| Materialize trigger | Auto en `useEffect` del dashboard | Botón manual | Decidido por el usuario en pregunta previa. |
| Delivery | Single PR | Backend → Frontend chained | Preferencia cacheada del usuario para features tightly-coupled. |

## 5. Risks

- **Tamaño LOC ~1100-1300** — sobre 800. Pero coupling fuerte (frontend necesita endpoint nuevo). Aplica `size:exception` consistente con prácticas previas (e.g. wallet-edit-delete, category-fork).
- **Caps no infinitos**: el loop de materialize se corta a 50 iter (×20 = 1000 tx). Si una recurring está 100 meses atrasada con `dayOfMonth=1`, sólo se materializan ~83 (1000/12 recurrings). En la práctica, una recurring nueva nunca puede estar > 1 mes atrasada, así que el cap es defensivo, no operacional.
- **Drift de fecha en clamp**: si `dayOfMonth=31`, una recurring puede dispararse el 28-Feb, 31-Mar, 30-Apr, 31-May. El día efectivo varía. Aceptado: es el comportamiento estándar de cualquier app de finanzas. Documentar en el helper.
- **TransactionMapper reuse**: la tx materializada se persiste idéntica a una manual. No hay `source: 'recurring'` field — si después se quiere distinguir, hay que migrar.
- **PATCH de `dayOfMonth`** recalcula `nextOccurrenceAt`: si el usuario cambia de 1 a 28 mientras la del mes ya se materializó, el cambio aplica para el próximo mes. Documentado en el use case.

## 6. LOC estimate

| Área | LOC aprox |
|---|---|
| Domain (entity + errors + 6 use cases + repo iface + value objects) | ~400 |
| API (DDB repo + mapper + keyBuilders + 6 handlers + serverless.yml) | ~450 |
| Shared-types (schemas) | ~80 |
| Container wiring | ~30 |
| Web (page + form + components + api + queries + hooks) | ~380 |
| Routes + nav + i18n | ~40 |
| Total | **~1380** |

Sobre 800 budget. **Estrategia**: single PR con `size:exception` (preferencia cacheada del usuario). Si el review se siente pesado, partir backend → frontend chained queda como fallback.

## 7. Open questions

Ninguna. Cadence, trigger y scope ya están confirmados por el usuario.
