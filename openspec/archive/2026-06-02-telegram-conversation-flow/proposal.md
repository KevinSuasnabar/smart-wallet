# Proposal: Telegram Conversation Flow

## Intent

Current `/gasto` and `/ingreso` commands force the user to remember arg order, type wallet names from memory, and hardcode category to `other`. This is error-prone and unusable for non-trivial categorization. Replace the one-shot command with a **guided multi-step conversation** that fetches REAL wallets + categories, lets the user TAP buttons, and confirms before persisting. Goal: zero-typing-mistakes UX and 100% real wallet/category usage.

## Scope

### In Scope

- Multi-step flow for `/gasto` and `/ingreso` using `@grammyjs/conversations`
- Inline keyboards for wallet selection (from `listWallets`) and category selection (filtered by tx type)
- Free-text step parsing `<amount> [description]`
- Confirmation step with `[Confirmar] [Cancelar]` buttons
- Cancel from any step (`/cancel` or button) returns to idle
- New DynamoDB table `smart-wallet-telegram-sessions` (PK = chat_id, TTL = 10 min)
- Hexagonal session storage adapter (`SessionRepository` port + Dynamo adapter) — NOT `@grammyjs/storage-dynamodb`
- All IO inside conversations wrapped with `conversation.external()` to avoid replay side effects
- Single shared conversation function `recordTransaction(type: "income" | "expense")`
- CDK + Serverless updates for the new table and IAM
- Wire conversations plugin into `bot.ts` before commands

### Out of Scope

- `/balance` command implementation (already a stub, separate change)
- Wallet creation, editing, deletion via Telegram
- Category creation via Telegram (categories stay predefined)
- Multi-user support / multi-tenant isolation beyond `MY_TELEGRAM_ID`
- Reporting, charts, exports
- Migrating existing tests (no test runner installed)
- Internationalization (Spanish only, like today)

## Capabilities

### New Capabilities

- `telegram-conversation-flow`: Multi-step guided dialog (amount → wallet → category → confirm) for recording income and expense transactions via Telegram, including session persistence and inline-keyboard navigation.

### Modified Capabilities

- None (no existing specs in `openspec/specs/`).

## Approach

1. Adopt `@grammyjs/conversations` (replay-based state machine). Single function `recordTransaction(type)` drives both `/gasto` and `/ingreso`.
2. Define a hexagonal `SessionRepository` port in `domain/`; implement DynamoDB adapter in `api/src/adapters/dynamodb/`. The grammY storage adapter shim lives in `api/src/telegram/storage/` and delegates to the repository.
3. Provision a **separate** DynamoDB table (`smart-wallet-telegram-sessions`) — keeps session churn isolated from the main single-table and matches the user's explicit request. PK = `chat_id` (string), `ttl` attribute, on-demand billing.
4. Wrap every container call (`listWallets`, `listCategories`, `addTransaction`) with `conversation.external(...)` so replays don't double-fire side effects.
5. Categories come from `@smart-wallet/shared-types/categories` filtered by tx type; keyboards paginated only if > 8 items (currently 9 expense / 5 income — single screen ok).
6. Register `conversations()` middleware after `auth` and before command handlers in `bot.ts`. Each command becomes a thin entrypoint calling `ctx.conversation.enter("recordTransaction:expense"|"recordTransaction:income")`.
7. Confirmation step uses `callback_query` handlers; cancel clears active conversation.

## Affected Areas

| Area                                                            | Impact   | Description                                                    |
| --------------------------------------------------------------- | -------- | -------------------------------------------------------------- |
| `packages/api/src/telegram/bot.ts`                              | Modified | Register conversations plugin + session middleware             |
| `packages/api/src/telegram/context.ts`                          | Modified | Extend `BotContext` with `ConversationFlavor` + session type   |
| `packages/api/src/telegram/commands/expense.ts`                 | Modified | Replace inline parsing with `ctx.conversation.enter(...)`      |
| `packages/api/src/telegram/commands/income.ts`                  | Modified | Same as expense                                                |
| `packages/api/src/telegram/conversations/recordTransaction.ts`  | New      | Shared multi-step flow                                         |
| `packages/api/src/telegram/keyboards/`                          | New      | Builders for wallet, category, confirm keyboards               |
| `packages/api/src/telegram/storage/`                            | New      | grammY storage adapter delegating to `SessionRepository`       |
| `packages/domain/src/ports/SessionRepository.ts`                | New      | Hexagonal port                                                 |
| `packages/api/src/adapters/dynamodb/DynamoSessionRepository.ts` | New      | Adapter implementation                                         |
| `packages/api/src/adapters/dynamodb/keyBuilders.ts`             | Modified | Add session key builder (separate table, but same util module) |
| `packages/api/src/composition/container.ts`                     | Modified | Wire `SessionRepository`                                       |
| `packages/infra-cdk/src/stacks/SmartWalletStack.ts`             | Modified | New `Table` construct + grant IAM                              |
| `packages/infra-sls/serverless.yml`                             | Modified | Resource + IAM for new table; `TELEGRAM_SESSIONS_TABLE` env    |

## Risks

| Risk                                                            | Likelihood | Mitigation                                                                                 |
| --------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------ |
| Replay re-executes container side effects (double transactions) | High       | Wrap ALL container calls in `conversation.external()`; review checklist in spec            |
| Dynamo session writes hit hot-partition on single chat_id       | Low        | Single-user (MY_TELEGRAM_ID) bot, traffic is human-paced; on-demand billing absorbs spikes |
| Conversation gets stuck (user abandons mid-flow)                | Med        | TTL of 10 min auto-deletes; `/cancel` command available globally                           |
| Inline keyboard `callback_data` exceeds 64-byte Telegram limit  | Med        | Use short IDs (`w:<id>`, `c:<id>`); validate length in keyboard builders                   |
| Loss of existing one-shot UX for power users                    | Low        | Keep accepting `/gasto <amount> <desc>` shortcut that skips first step (decide in design)  |
| New table cost overlooked                                       | Low        | On-demand + TTL keeps sessions ephemeral; expected < $0.01/mo at current traffic           |
| grammY `conversations` v2 API breaking changes                  | Low        | Pin minor version; document upgrade path in design                                         |

## Rollback Plan

1. Revert the feature branch — bot reverts to one-shot commands instantly.
2. The new `smart-wallet-telegram-sessions` table is independent; leave it (empty, costs nothing) or destroy via CDK/SLS.
3. No data migration needed — main single-table is untouched.
4. No schema change to existing transaction/wallet entities.

## Dependencies

- `@grammyjs/conversations` (new dep in `packages/api`)
- `grammy ^1.43.0` (already installed)
- AWS SDK v3 DynamoDB client (already used by existing adapters)
- `MY_TELEGRAM_ID` env var (already configured)

## Success Criteria

- [ ] `/gasto` and `/ingreso` walk through amount → wallet → category → confirm without typing wallet/category names
- [ ] Selected wallet and category come from REAL data (no more hardcoded `"Gastos"` / `expense:other`)
- [ ] Confirming creates exactly ONE transaction (no replay duplicates)
- [ ] Cancel at any step results in no DB writes and clears session
- [ ] Abandoned sessions vanish from DynamoDB within ~10 min (TTL)
- [ ] `bot.ts`, commands, adapters all pass `tsc --noEmit` in strict mode
- [ ] CDK and SLS deploys both provision the new table and IAM in dev
