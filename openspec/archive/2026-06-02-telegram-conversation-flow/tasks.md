# Tasks: Telegram Conversation Flow

## Review Workload Forecast

| Field                   | Value                                                                                                           |
| ----------------------- | --------------------------------------------------------------------------------------------------------------- |
| Estimated changed lines | ~460–510 (additions + deletions)                                                                                |
| 400-line budget risk    | High                                                                                                            |
| Chained PRs recommended | Yes                                                                                                             |
| Suggested split         | PR 1: Infra + Ports + Adapters → PR 2: Keyboards + Conversation + Bot wiring → PR 3: Command rewrites + Cleanup |
| Delivery strategy       | ask-on-risk                                                                                                     |
| Chain strategy          | pending                                                                                                         |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: pending
400-line budget risk: High

### Suggested Work Units

| Unit | Goal                                                                                          | Likely PR | Notes                                                                 |
| ---- | --------------------------------------------------------------------------------------------- | --------- | --------------------------------------------------------------------- |
| 1    | Sessions infra: CDK construct, serverless IAM/env, env.ts, package.json dep                   | PR 1      | Base: main; no runtime behaviour change; safe to merge alone          |
| 2    | Hexagonal session layer: port, adapter, storage shim, DI wiring                               | PR 2      | Base: PR 1 branch; depends on table name env var from Unit 1          |
| 3    | Conversation runtime: keyboards, recordTransaction, context, bot middleware, command rewrites | PR 3      | Base: PR 2 branch; final user-facing behaviour; requires Unit 2 wired |

---

## Phase 1: Infrastructure & Dependency (PR 1 scope)

- [ ] 1.1 `packages/api/package.json` — add `@grammyjs/conversations ^2.0.0` to `dependencies`; run `pnpm install` to update lockfile
- [ ] 1.2 `packages/infra-cdk/src/constructs/TelegramSessionsTable.ts` — create CDK L2 construct: `TableV2` PK=`chatId` (S), TTL attribute=`ttl`, `BillingMode.PAY_PER_REQUEST`, `RemovalPolicy.RETAIN`; export `tableArn` and `tableName` as construct properties
- [ ] 1.3 `packages/infra-cdk/src/stacks/SmartWalletStack.ts` — instantiate `TelegramSessionsTable`; add `CfnOutput` for table name
- [ ] 1.4 `packages/infra-cdk/src/constructs/SsmParameters.ts` — export new table ARN/name as SSM parameters consistent with existing pattern
- [ ] 1.5 `packages/infra-sls/serverless.yml` — add `TELEGRAM_SESSIONS_TABLE` env var (ref SSM or hardcoded offline default); add IAM statements `dynamodb:GetItem`, `dynamodb:PutItem`, `dynamodb:DeleteItem` scoped to sessions table ARN
- [ ] 1.6 `packages/api/src/env.ts` — add `telegramSessionsTable: process.env.TELEGRAM_SESSIONS_TABLE ?? 'smart-wallet-telegram-sessions-local'`; verify `tsc --noEmit` passes

**Dependency**: 1.1 independent; 1.2 independent; 1.3 depends on 1.2; 1.4 depends on 1.2; 1.5 depends on 1.4 (or can reference ARN directly); 1.6 independent.

---

## Phase 2: Hexagonal Session Layer (PR 2 scope)

- [ ] 2.1 `packages/api/src/telegram/ports/TelegramSessionRepository.ts` — define port interface with `read(chatId): Promise<string | undefined>`, `write(chatId, value): Promise<void>`, `delete(chatId): Promise<void>`
- [ ] 2.2 `packages/api/src/adapters/dynamodb/repositories/DynamoDBTelegramSessionRepository.ts` — implement port: `GetCommand`/`PutCommand`/`DeleteCommand` using shared `ddb` from `DynamoDBClient.ts`; PK=`chatId`; TTL = `Math.floor(Date.now()/1000) + 600` on every `write`
- [ ] 2.3 `packages/api/src/adapters/dynamodb/keyBuilders.ts` — add `telegramSessionKey(chatId: string)` helper (keeps key construction consistent with rest of codebase)
- [ ] 2.4 `packages/api/src/adapters/dynamodb/index.ts` — re-export `DynamoDBTelegramSessionRepository`
- [ ] 2.5 `packages/api/src/telegram/storage/grammyStorageAdapter.ts` — implement `makeGrammyStorage(repo: TelegramSessionRepository): StorageAdapter<unknown>` delegating read/write/delete to port; JSON serialisation here only
- [ ] 2.6 `packages/api/src/composition/container.ts` — instantiate `DynamoDBTelegramSessionRepository`; add `telegramSessionRepo` to exported container; verify `tsc --noEmit`

**Dependency order**: 2.1 → 2.2 → 2.3 (2.3 can be done alongside 2.2); 2.4 after 2.2; 2.5 after 2.1; 2.6 after 2.2 and 2.5.

---

## Phase 3: Conversation Runtime & Bot Wiring (PR 3 scope)

- [ ] 3.1 `packages/api/src/telegram/context.ts` — import `SessionFlavor`, `ConversationFlavor` from grammY libs; define `SessionData {}`; redefine `BotContext = Context & SessionFlavor<SessionData> & ConversationFlavor<Context>`; update all existing imports if needed
- [ ] 3.2 `packages/api/src/telegram/keyboards/wallet.ts` — create `buildWalletKeyboard(wallets: Wallet[]): InlineKeyboard`; each button: label=wallet.name, `callback_data=w:<walletId>` (must be ≤64 bytes — assert in implementation)
- [ ] 3.3 `packages/api/src/telegram/keyboards/category.ts` — create `buildCategoryKeyboard(type: 'expense' | 'income'): InlineKeyboard`; filter `PREDEFINED_CATEGORIES` by type; `callback_data=c:<categoryId>` (≤64 bytes)
- [ ] 3.4 `packages/api/src/telegram/keyboards/confirm.ts` — create `buildConfirmKeyboard(): InlineKeyboard`; two buttons: `[✅ Confirmar / cf:y]` and `[❌ Cancelar / cf:n]`
- [ ] 3.5 `packages/api/src/telegram/conversations/recordTransaction.ts` — implement factory `recordTransaction(type: 'income'|'expense')`: prompt amount (regex validate, loop on error), `conversation.external(listWallets)`, show wallet keyboard, wait `w:` cb, show category keyboard, wait `c:` cb, show confirm keyboard, wait `cf:` cb, `conversation.external(addTransaction)` on confirm; all container calls inside `conversation.external()`
- [ ] 3.6 `packages/api/src/telegram/commands/cancel.ts` — create `/cancel` handler: `await ctx.conversation.exit(); ctx.reply("Operación cancelada.")`
- [ ] 3.7 `packages/api/src/telegram/commands/expense.ts` — replace one-shot parsing with `await ctx.conversation.enter("recordTransaction:expense")`; remove all argument parsing and direct DynamoDB writes
- [ ] 3.8 `packages/api/src/telegram/commands/income.ts` — same replacement as 3.7 for `"recordTransaction:income"`
- [ ] 3.9 `packages/api/src/telegram/commands/index.ts` — register `cancelCommand`; verify exports are correct
- [ ] 3.10 `packages/api/src/telegram/bot.ts` — insert middleware in order after `authMiddleware`: `session(makeGrammyStorage)`, `conversations()`, `createConversation(recordTransaction('expense'), 'recordTransaction:expense')`, `createConversation(recordTransaction('income'), 'recordTransaction:income')`; update help text in default text handler to remove argument syntax (satisfies REQ-COMPAT-01)
- [ ] 3.11 Run `tsc --noEmit` in `packages/api`; fix any type errors before marking phase done

**Dependency order**: 3.1 first (all others depend on context type); 3.2, 3.3, 3.4 in parallel after 3.1; 3.5 after 3.2+3.3+3.4; 3.6, 3.7, 3.8 after 3.1; 3.9 after 3.6; 3.10 after 3.5+3.9; 3.11 last.

---

## Phase 4: Verification

- [ ] 4.1 Manual smoke: send `/gasto` → complete 4-step flow → verify transaction recorded in DynamoDB
- [ ] 4.2 Manual smoke: send `/ingreso` → complete 4-step flow → verify transaction recorded
- [ ] 4.3 Manual smoke: send `/cancel` at Step 2 → verify session cleared, no transaction written
- [ ] 4.4 Manual smoke: send `/gasto 50 almuerzo` (old shortcut) → verify bot enters guided flow ignoring arguments (REQ-COMPAT-01)
- [ ] 4.5 Verify `callback_data` lengths: log or assert `w:<uuid>` ≤ 64 bytes, `c:<categoryId>` ≤ 64 bytes
- [ ] 4.6 Verify TTL: write a session item; check DynamoDB console that `ttl` = epoch+600
- [ ] 4.7 `tsc --noEmit` clean pass across all packages
