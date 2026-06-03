# Tasks: Telegram Multi-User Support

## Review Workload Forecast

| Field                   | Value                                                            |
| ----------------------- | ---------------------------------------------------------------- |
| Estimated changed lines | 520–650                                                          |
| 400-line budget risk    | High                                                             |
| Chained PRs recommended | Yes                                                              |
| Suggested split         | PR 1: Backend foundation + bot wiring → PR 2: REST endpoint + UI |
| Delivery strategy       | ask-on-risk                                                      |
| Chain strategy          | pending                                                          |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: pending
400-line budget risk: High

### Suggested Work Units

| Unit | Goal                                                                                        | Likely PR | Notes                                                                                 |
| ---- | ------------------------------------------------------------------------------------------- | --------- | ------------------------------------------------------------------------------------- |
| 1    | Key builders + ports + DynamoDB adapters + userResolverMiddleware + bot wiring (ctx.userId) | PR 1      | Base: `feat/telegram-conversation-flow`; self-contained; bot works per-user on deploy |
| 2    | `generateLinkToken` handler + serverless route + web `TelegramLinkSection` UI               | PR 2      | Base: PR 1 branch; requires PR 1 repos wired in container                             |

---

## Phase 1: Foundation — Key Builders & Ports (PR 1 scope)

- [ ] 1.1 Add `telegramPK(telegramId: number): string`, `telegramLinkSK(): string`, `telegramTokenSK(): string` to `packages/api/src/adapters/dynamodb/keyBuilders.ts` (REQ-RESOLVE-04)
- [ ] 1.2 Re-export the three new builders from `packages/api/src/adapters/dynamodb/index.ts`
- [ ] 1.3 Create `packages/api/src/telegram/ports/TelegramLinkRepository.ts` — interface `TelegramLink` + `findByTelegramId` + `save` (REQ-RESOLVE-05)
- [ ] 1.4 Create `packages/api/src/telegram/ports/TelegramLinkTokenRepository.ts` — interface `TelegramLinkToken` + `create` + `consume` (REQ-RESOLVE-05)

## Phase 2: DynamoDB Adapters (PR 1 scope)

- [ ] 2.1 Create `packages/api/src/adapters/dynamodb/repositories/DynamoDBTelegramLinkRepository.ts` — `GetItem` on `TELEGRAM#<id>/LINK` for `findByTelegramId`; `PutItem` for `save`; no TTL on link item (REQ-LINK-04)
- [ ] 2.2 Create `packages/api/src/adapters/dynamodb/repositories/DynamoDBTelegramLinkTokenRepository.ts` — `PutItem` with `ttl` for `create`; `DeleteCommand` with `ReturnValues: 'ALL_OLD'` + `ConditionExpression: 'attribute_exists(PK) AND #ttl > :now'` for atomic `consume` (REQ-LINK-03, Decision 3, Decision 4)
- [ ] 2.3 Re-export both new repos from `packages/api/src/adapters/dynamodb/index.ts`
- [ ] 2.4 Instantiate `telegramLinkRepo` and `telegramLinkTokenRepo` singletons in `packages/api/src/composition/container.ts`; expose both on the `container` object (sw-hexagonal: composition root only)

## Phase 3: Bot Middleware & Context (PR 1 scope)

- [ ] 3.1 Extend `BotContext` in `packages/api/src/telegram/context.ts` to `ConversationFlavor<Context> & { userId: string }` (REQ-RESOLVE-01)
- [ ] 3.2 Replace `authMiddleware` in `packages/api/src/telegram/middleware/auth.ts` with `userResolverMiddleware`: `GetItem TELEGRAM#<from.id>/LINK` → set `ctx.userId`; fallback `env.myTelegramId` → `ctx.userId = env.botUserId`; else reply with linking instructions and stop (REQ-RESOLVE-02, Decision 2)
- [ ] 3.3 Remove `env.botUserId` from `packages/api/src/env.ts` (REQ-RESOLVE-07); keep `myTelegramId`; note: keep `botUserId` temporarily as fallback value in middleware only until env refactor is clean
- [ ] 3.4 Update `packages/api/src/telegram/commands/balance.ts`: replace `env.botUserId` → `ctx.userId` (REQ-RESOLVE-01)
- [ ] 3.5 Update `packages/api/src/telegram/conversations/recordTransaction.ts`: add `userId: string` as factory parameter; replace both `env.botUserId` usages with the parameter (REQ-RESOLVE-03)
- [ ] 3.6 Update `packages/api/src/telegram/commands/new.ts`: capture `const userId = ctx.userId` from outer `BotContext` before entering conversation; pass per-enter factory `recordTransaction(userId)` (Decision 1, REQ-RESOLVE-03)
- [ ] 3.7 Update `packages/api/src/telegram/bot.ts`: swap `authMiddleware` → `userResolverMiddleware`; remove module-scope `createConversation(recordTransaction(), ...)` static registration — conversation is now registered per-enter inside `new.ts` (Decision 1)

## Phase 4: /start Command (PR 1 scope)

- [ ] 4.1 Create `packages/api/src/telegram/commands/start.ts` — `registerStartCommand(bot)`: parse `<userId>.<32-hex>` from `/start` args; reject malformed format; call `container.telegramLinkTokenRepo.consume(token)` → on null reply "token invalid or expired"; check existing link via `container.telegramLinkRepo.findByTelegramId(ctx.from.id)` → on hit reply "already linked"; `save` permanent link; reply success (REQ-LINK-03, REQ-LINK-04)
- [ ] 4.2 Register `registerStartCommand` in `packages/api/src/telegram/commands/index.ts` (sw-telegram convention)

## Phase 5: REST Endpoint (PR 2 scope)

- [ ] 5.1 Create `packages/api/src/handlers/telegram/generateLinkToken.ts` — `withErrorHandler(withAuth(handler))`; generate `${event.userId}.<32-hex>`; call `container.telegramLinkTokenRepo.create(userId, ttlSeconds=900)`; return `{ token, expiresAt, botUsername }` (REQ-LINK-01, sw-handler)
- [ ] 5.2 Create `packages/infra-sls/src/handlers/telegram/generateLinkToken.ts` — one-line re-export proxy (sw-handler, REQ-RESOLVE-06)
- [ ] 5.3 Add `generateLinkToken` function to `packages/infra-sls/serverless.yml` with `POST /telegram/link-token` + `authorizer: cognitoJwtAuthorizer` (REQ-RESOLVE-06, sw-serverless; static path goes before parametric)

## Phase 6: Web UI (PR 2 scope)

- [ ] 6.1 Add `t.settings.telegram.*` keys to `packages/web/src/lib/i18n.ts`: `eyebrow`, `title`, `linked`, `unlinked`, `generateCta`, `copyToken`, `expiryHint`, `alreadyLinked` (REQ-LINK-05, sw-web)
- [ ] 6.2 Create `packages/web/src/features/settings/queries.ts` — `useGenerateLinkToken` mutation (React Query `useMutation`) calling `POST /telegram/link-token` (REQ-LINK-05)
- [ ] 6.3 Create `packages/web/src/features/settings/components/TelegramLinkSection.tsx` — displays link status, "Generate token" CTA, token + copy-to-clipboard, expiry hint using `t.settings.telegram.*` exclusively (REQ-LINK-05)
- [ ] 6.4 Add `<TelegramLinkSection />` to `packages/web/src/features/settings/pages/SettingsPage.tsx` (REQ-LINK-05)

## Phase 7: Tests

- [ ] 7.1 Unit test `telegramPK`, `telegramLinkSK`, `telegramTokenSK` in `keyBuilders.test.ts` (REQ-RESOLVE-04 scenarios)
- [ ] 7.2 Unit test `userResolverMiddleware`: linked user → `ctx.userId` set; whitelist hit → passes; unlinked non-whitelist → stops + replies; no `ctx.from` → stops (REQ-RESOLVE-02 scenarios)
- [ ] 7.3 Unit test `/start` command: valid token → link written; already-consumed → null return; malformed → parse error before DB; already-linked → early reply (REQ-LINK-03 scenarios)
- [ ] 7.4 Unit test `generateLinkToken` handler: token format `<userId>.<32-hex>`; `expiresAt` ~15 min ahead; 401 on missing auth (REQ-LINK-01 scenarios)
- [ ] 7.5 Unit test `TelegramLinkSection`: unlinked renders CTA; post-mutation shows token + copy button + expiry hint; no raw strings in JSX (REQ-LINK-05 scenarios)
