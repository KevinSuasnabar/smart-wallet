# Design: Telegram Conversation Flow

## Technical Approach

Adopt `@grammyjs/conversations` v2 to drive a single replay-safe state machine `recordTransaction(type)` shared by `/gasto` and `/ingreso`. Persist conversation state in a NEW DynamoDB table (`smart-wallet-telegram-sessions`) behind a `TelegramSessionRepository` port and `DynamoDBTelegramSessionRepository` adapter, wired manually in `container.ts`. All container/IO calls inside the conversation are wrapped in `conversation.external()` so replays never double-execute side effects.

## Architecture Decisions

### Decision: Port lives in `packages/api/`, NOT `packages/domain/`

**Choice**: `packages/api/src/telegram/ports/TelegramSessionRepository.ts`
**Alternatives considered**: `packages/domain/src/ports/...` (per proposal).
**Rationale**: Telegram session storage is a transport-layer concern that persists grammY conversation BLOBs — it is NOT a business entity. The domain package must remain framework-agnostic (no grammY/Telegram leakage). The existing convention also avoids a `ports/` folder — repos live in feature folders. Placing this port in `api/telegram/ports/` respects both hexagonal purity AND established codebase layout.

### Decision: SEPARATE DynamoDB table (not single-table)

**Choice**: New table `smart-wallet-telegram-sessions`, PK=`chatId` (S), TTL=`ttl` (N), on-demand billing.
**Alternatives considered**: Reuse existing single-table with `PK=USER#botUserId`, `SK=SESSION#<chatId>`.
**Rationale**: User explicitly requested isolation. Session churn (write per step) does not pollute query patterns of the main table. TTL set to ~10 min auto-cleans abandoned sessions. Cost negligible (<$0.01/mo at single-user traffic).

### Decision: Shared `DynamoDBDocumentClient` instance

**Choice**: Reuse `ddb` exported from `adapters/dynamodb/DynamoDBClient.ts`; only the table NAME differs (`env.telegramSessionsTable`).
**Alternatives considered**: New client just for sessions.
**Rationale**: Same region, same credentials, same SDK config. A second client wastes a Lambda warm-pool connection.

### Decision: Single `recordTransaction(type)` conversation

**Choice**: One function parameterised by `'income' | 'expense'`; commands register as `'recordTransaction:expense'` and `'recordTransaction:income'`.
**Alternatives**: Two near-duplicate conversations.
**Rationale**: 95% of the flow is identical (amount → wallet → category → confirm). Type only affects category filter and confirmation copy.

### Decision: Drop one-shot `/gasto <amount>` shortcut

**Choice**: Pure conversational flow. (Resolves proposal open question 1.)
**Rationale**: Maintaining two parallel parsing paths doubles surface area for bugs. Conversation is 4 taps — faster than typing for the single human user.

### Decision: `callback_data` short format `w:<id>` / `c:<id>` / `cf:<y|n>`

**Choice**: Two-char prefix + colon + UUID/categoryId.
**Rationale**: Telegram hard-limits `callback_data` to 64 bytes. Wallet UUID v4 = 36 chars; with `w:` prefix = 38 bytes — well under the limit. Category IDs (`expense:transport`) max 20 chars + `c:` = 22 bytes.

## Data Flow

```
User /gasto
   │
   ▼
authMiddleware ── filter MY_TELEGRAM_ID
   │
   ▼
session() ── load { chatId } → grammY conversation state from Dynamo
   │
   ▼
conversations() plugin
   │
   ▼
gasto command handler → ctx.conversation.enter("recordTransaction:expense")
   │
   ▼
recordTransaction(conversation, ctx, "expense")
   │   ├─ ask amount  → wait(:text)
   │   ├─ external(listWallets) → buildWalletKeyboard → wait(:callback_query)
   │   ├─ buildCategoryKeyboard(type) → wait(:callback_query)
   │   ├─ buildConfirmKeyboard → wait(:callback_query)
   │   └─ external(addTransaction) → reply ✅
   │
   ▼
session() writes updated state OR deletes if conversation ended
   │
   ▼
DynamoDBTelegramSessionRepository.write|delete
   │
   ▼
DynamoDB smart-wallet-telegram-sessions (TTL = now + 600s)
```

## File Changes

| File                                                                                   | Action | Description                                                                                                                                  |
| -------------------------------------------------------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/api/src/telegram/ports/TelegramSessionRepository.ts`                         | Create | Port interface (`read`/`write`/`delete`)                                                                                                     |
| `packages/api/src/adapters/dynamodb/repositories/DynamoDBTelegramSessionRepository.ts` | Create | Adapter; uses shared `ddb` client; PK=`chatId`, TTL field                                                                                    |
| `packages/api/src/adapters/dynamodb/keyBuilders.ts`                                    | Modify | Add `telegramSessionKey(chatId)` returning `{ chatId }` (different table — no PK/SK composition)                                             |
| `packages/api/src/adapters/dynamodb/index.ts`                                          | Modify | Export new adapter                                                                                                                           |
| `packages/api/src/telegram/storage/grammyStorageAdapter.ts`                            | Create | grammY `StorageAdapter<SessionData>` shim delegating to the port (`read`/`write`/`delete` signatures)                                        |
| `packages/api/src/telegram/conversations/recordTransaction.ts`                         | Create | The shared multi-step flow                                                                                                                   |
| `packages/api/src/telegram/keyboards/wallet.ts`                                        | Create | `buildWalletKeyboard(wallets)` → `InlineKeyboard`                                                                                            |
| `packages/api/src/telegram/keyboards/category.ts`                                      | Create | `buildCategoryKeyboard(type)` filters `PREDEFINED_CATEGORIES`                                                                                |
| `packages/api/src/telegram/keyboards/confirm.ts`                                       | Create | `buildConfirmKeyboard()` with `cf:y`/`cf:n`                                                                                                  |
| `packages/api/src/telegram/context.ts`                                                 | Modify | Extend BotContext with `SessionFlavor<SessionData>` + `ConversationFlavor`                                                                   |
| `packages/api/src/telegram/bot.ts`                                                     | Modify | Insert `session()` + `conversations()` middleware; register `createConversation(recordTransaction, "recordTransaction:expense"/...:income")` |
| `packages/api/src/telegram/commands/expense.ts`                                        | Modify | Replace parsing with `await ctx.conversation.enter("recordTransaction:expense")`                                                             |
| `packages/api/src/telegram/commands/income.ts`                                         | Modify | Same as expense                                                                                                                              |
| `packages/api/src/telegram/commands/cancel.ts`                                         | Create | `/cancel` → `await ctx.conversation.exit()` + reply                                                                                          |
| `packages/api/src/telegram/commands/index.ts`                                          | Modify | Register cancel command                                                                                                                      |
| `packages/api/src/composition/container.ts`                                            | Modify | Instantiate `telegramSessionRepo` and expose on `container`                                                                                  |
| `packages/api/src/env.ts`                                                              | Modify | Add `telegramSessionsTable: process.env.TELEGRAM_SESSIONS_TABLE ?? 'smart-wallet-telegram-sessions-local'`                                   |
| `packages/api/package.json`                                                            | Modify | Add `"@grammyjs/conversations": "^2.0.0"`                                                                                                    |
| `packages/infra-cdk/src/constructs/TelegramSessionsTable.ts`                           | Create | CDK construct (PK=`chatId` STRING, TTL=`ttl`, PAY_PER_REQUEST, RETAIN)                                                                       |
| `packages/infra-cdk/src/stacks/SmartWalletStack.ts`                                    | Modify | Instantiate `TelegramSessionsTable`; SSM param + CfnOutput                                                                                   |
| `packages/infra-cdk/src/constructs/SsmParameters.ts`                                   | Modify | Expose new table ARN/name as SSM params                                                                                                      |
| `packages/infra-sls/serverless.yml`                                                    | Modify | `TELEGRAM_SESSIONS_TABLE` env; IAM allows `GetItem/PutItem/DeleteItem` on the new table ARN                                                  |

## Interfaces / Contracts

### Port

```ts
// packages/api/src/telegram/ports/TelegramSessionRepository.ts
export interface TelegramSessionRepository {
  read(chatId: string): Promise<string | undefined>;
  write(chatId: string, value: string): Promise<void>;
  delete(chatId: string): Promise<void>;
}
```

Values are **opaque strings** — grammY serialises `SessionData` to JSON before calling the storage adapter. The port stays domain-free.

### Adapter shape

```ts
// DynamoDBTelegramSessionRepository
async read(chatId) {
  const r = await ddb.send(new GetCommand({
    TableName: env.telegramSessionsTable, Key: { chatId },
  }));
  return r.Item?.value as string | undefined;
}
async write(chatId, value) {
  const ttl = Math.floor(Date.now() / 1000) + 600;
  await ddb.send(new PutCommand({
    TableName: env.telegramSessionsTable,
    Item: { chatId, value, ttl },
  }));
}
async delete(chatId) {
  await ddb.send(new DeleteCommand({
    TableName: env.telegramSessionsTable, Key: { chatId },
  }));
}
```

### Context flavors

```ts
// packages/api/src/telegram/context.ts
import type { Context, SessionFlavor } from 'grammy';
import type { ConversationFlavor } from '@grammyjs/conversations';

export interface SessionData {
  // grammY conversations plugin owns this shape internally;
  // we just declare it for type inference.
}

export type BotContext = Context & SessionFlavor<SessionData> & ConversationFlavor<Context>;
```

### grammY storage adapter shim

```ts
// packages/api/src/telegram/storage/grammyStorageAdapter.ts
import type { StorageAdapter } from 'grammy';
import type { TelegramSessionRepository } from '../ports/TelegramSessionRepository.js';

export const makeGrammyStorage = (repo: TelegramSessionRepository): StorageAdapter<unknown> => ({
  async read(key) {
    const raw = await repo.read(key);
    return raw === undefined ? undefined : JSON.parse(raw);
  },
  async write(key, value) {
    await repo.write(key, JSON.stringify(value));
  },
  async delete(key) {
    await repo.delete(key);
  },
});
```

### Conversation skeleton

```ts
// packages/api/src/telegram/conversations/recordTransaction.ts
export const recordTransaction =
  (type: 'income' | 'expense') => async (conversation: MyConversation, ctx: BotContext) => {
    const userId = env.botUserId; // already validated by middleware

    await ctx.reply('¿Cuál es el monto?');
    const amountCtx = await conversation.waitFor(':text');
    const money = parseAmountForCurrency(amountCtx.message.text, 'PEN');
    if (!money.ok) {
      await ctx.reply('❌ Monto inválido');
      return;
    }

    const wallets = await conversation.external(() => container.listWallets({ userId }));
    if (!wallets.ok || wallets.value.items.length === 0) {
      await ctx.reply('❌ No tenés wallets. Creá una primero desde la web.');
      return;
    }
    await ctx.reply('Elegí wallet:', { reply_markup: buildWalletKeyboard(wallets.value.items) });
    const walletCb = await conversation.waitForCallbackQuery(/^w:/);
    const walletId = walletCb.callbackQuery.data.slice(2);

    await ctx.reply('Elegí categoría:', { reply_markup: buildCategoryKeyboard(type) });
    const catCb = await conversation.waitForCallbackQuery(/^c:/);
    const categoryId = catCb.callbackQuery.data.slice(2);

    await ctx.reply(`Confirmar ${type} de S/ ${amountCtx.message.text}?`, {
      reply_markup: buildConfirmKeyboard(),
    });
    const confirmCb = await conversation.waitForCallbackQuery(/^cf:/);
    if (confirmCb.callbackQuery.data !== 'cf:y') {
      await ctx.reply('Cancelado.');
      return;
    }

    const result = await conversation.external(() =>
      container.addTransaction({
        userId,
        walletId,
        type,
        amountCents: money.value.amount,
        currency: 'PEN',
        categoryId,
        description: null,
        occurredAt: new Date(),
      }),
    );
    await ctx.reply(result.ok ? `✅ Registrado` : `❌ Falló: ${result.error.code}`);
  };
```

### Keyboard builders

```ts
// keyboards/wallet.ts
export const buildWalletKeyboard = (wallets: Wallet[]) => {
  const kb = new InlineKeyboard();
  wallets.forEach((w, i) => {
    kb.text(w.name, `w:${w.id.value}`);
    if ((i + 1) % 2 === 0) kb.row();
  });
  return kb;
};

// keyboards/category.ts
export const buildCategoryKeyboard = (type: 'income' | 'expense') => {
  const kb = new InlineKeyboard();
  PREDEFINED_CATEGORIES.filter((c) => c.type === type).forEach((c, i) => {
    kb.text(c.name, `c:${c.categoryId}`);
    if ((i + 1) % 2 === 0) kb.row();
  });
  return kb;
};
```

`callback_data` length validated in unit test (none yet — see Testing) by `Buffer.byteLength(data) <= 64`.

### bot.ts middleware order

```
1. bot.use(authMiddleware)                              // existing
2. bot.use(session({ storage: makeGrammyStorage(...) })) // NEW — must precede conversations()
3. bot.use(conversations())                              // NEW
4. bot.use(createConversation(recordTransaction("expense"), "recordTransaction:expense"))
5. bot.use(createConversation(recordTransaction("income"),  "recordTransaction:income"))
6. registerCommands(bot)                                 // existing — gasto/ingreso now enter conversation
7. bot.on("message:text", defaultHandler)                // existing
```

### container.ts wiring

```ts
import { DynamoDBTelegramSessionRepository } from '../adapters/dynamodb/index.js';

const telegramSessionRepo = new DynamoDBTelegramSessionRepository();

export const container = {
  // ...existing
  telegramSessionRepo, // exposed for bot.ts to consume
} as const;
```

`bot.ts` imports `container.telegramSessionRepo` and feeds it to `makeGrammyStorage`.

### Error paths

| Scenario                  | Behavior                                                                                   |
| ------------------------- | ------------------------------------------------------------------------------------------ |
| Empty wallets             | Conversation replies "No tenés wallets" and exits cleanly (no DB write)                    |
| `listWallets` fails       | Reply "❌ No pude consultar tus wallets" and exit                                          |
| `addTransaction` fails    | Reply with `result.error.code`; session ends (Dynamo entry deleted by grammY)              |
| `/cancel` mid-flow        | `ctx.conversation.exit()` clears state; session row deleted                                |
| Abandoned conversation    | TTL (600s) auto-deletes the row; next message starts fresh                                 |
| `callback_data` malformed | `waitForCallbackQuery(/^w:/)` regex filter ignores mismatches — user re-prompted on resend |

## Testing Strategy

| Layer       | What to Test                                          | Approach                                              |
| ----------- | ----------------------------------------------------- | ----------------------------------------------------- |
| Unit        | keyboard builders return <64-byte callback_data       | TBD — no runner installed (out of scope per proposal) |
| Unit        | `DynamoDBTelegramSessionRepository.read/write/delete` | TBD                                                   |
| Integration | full conversation happy path with mocked container    | TBD                                                   |
| Smoke       | manual `/gasto` and `/ingreso` flows in dev           | Required before merge                                 |

Per proposal: no test runner exists yet → mandatory manual smoke + `tsc --noEmit` strict pass.

## Migration / Rollout

No data migration. New table provisioned empty. Bot redeploy switches behavior. Rollback = revert commit + (optionally) destroy the table (CDK `RETAIN` keeps it; it stays empty at no cost).

## Open Questions

- [ ] Confirm `@grammyjs/conversations` v2 exact version to pin (proposed `^2.0.0`).
- [ ] Should pagination be added preemptively for >8 wallets, or defer until count > 8? (Currently 1-2 wallets — defer.)
