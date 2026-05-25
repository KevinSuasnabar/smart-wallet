# Proposal: Telegram Multi-User Support

## Intent

Today the Telegram bot serves a single hardcoded operator. `env.botUserId` is consumed in three call sites and `env.myTelegramId` is the only ID the auth middleware accepts. This blocks every other Smart Wallet account from using the bot and ties the deployment to one person. We need a self-service flow where any authenticated web user can permanently link their Telegram account so every bot interaction resolves to the right `userId`, with zero ops involvement and no shared secrets.

## Scope

### In Scope

- One-time-use token linking flow: web generates token, user sends `/start <token>` to the bot.
- `BotContext.userId` resolved per update from a `TELEGRAM#<telegramId> → userId` DynamoDB record.
- `userResolverMiddleware` replacing the hardcoded `env.myTelegramId` whitelist comparison.
- Two new ports + DynamoDB adapters: `TelegramLinkRepository` and `TelegramLinkTokenRepository`.
- Two new persisted entities on the existing single-table (no new table, no new GSI).
- New REST endpoint `POST /telegram/link-token` (Cognito-authenticated) for token generation.
- `/start <token>` Telegram command that consumes the token and persists the link.
- Settings UI: `TelegramLinkSection` component with generate-token CTA, copy-to-clipboard, expiry hint.
- Removal of `env.botUserId` everywhere it is read; migration of `balance.ts` and `recordTransaction.ts` to `ctx.userId`.
- `conversation.external()` capture of `ctx.userId` at conversation entry so replays stay deterministic.

### Out of Scope

- Multi-Telegram-account-per-user (1 telegramId ↔ 1 userId only).
- Unlinking / revocation UI (deferred — manual delete is enough for v1).
- Admin dashboard for user management (Cognito console is sufficient).
- Cognito user provisioning automation (admin still creates users manually).
- Removing the `env.myTelegramId` env var (kept as fallback whitelist during rollout, removed in a follow-up).
- i18n for new settings copy beyond the existing `t.*` keys structure.
- Rate limiting on `/telegram/link-token` (single authenticated user, low risk for v1).

## Capabilities

### New Capabilities

- `telegram-account-linking`: Token-based linking flow that allows an authenticated Smart Wallet user to bind a Telegram account to their `userId`, including token generation, one-time consumption with TTL, persistent `telegramId → userId` mapping, and `/start <token>` command handling.
- `telegram-user-resolution`: Per-update resolution of `BotContext.userId` from the persistent Telegram link, replacing hardcoded whitelist auth; ensures every bot command, conversation, and side-effect operates on the linked user's data only.

### Modified Capabilities

- None (no existing specs in `openspec/specs/`; the prior `telegram-conversation-flow` change introduced flows but did not extract a published spec).

## Approach

Approach A from exploration (token-based linking). High-level steps:

1. Extend `BotContext` with `userId: string`. Replace `authMiddleware` with `userResolverMiddleware` that does a single `GetItem` by `PK=TELEGRAM#<telegramId>, SK=LINK`. Cache hit → set `ctx.userId` and `next()`. Miss → reply with linking instructions and stop the chain (no `next()`).
2. Add two new entities on the existing single-table:
   - `PK=TELEGRAM#<telegramId>, SK=LINK` → `{ userId, telegramId, linkedAt }` (permanent).
   - `PK=USER#<userId>, SK=TELEGRAMTOKEN#<token>` → `{ token, userId, ttl }` (15-min TTL via DynamoDB TTL attribute).
3. Token format: `<userId>.<32-hex-random>`. The bot parses `userId` from the token string and performs a direct `GetItem` (no GSI, no scan) on the user partition. `consume(token)` does GetItem + conditional DeleteItem in the same call path.
4. New `commands/start.ts` extracts `ctx.match`, consumes the token, writes the link, replies with success or a typed error (expired, invalid, already-linked).
5. New `POST /telegram/link-token` handler: authenticated by `cognitoJwtAuthorizer`, generates random 32 bytes hex, persists with TTL = now + 900s, returns `{ token, expiresAt, botUsername }`. Concurrent generation overwrites — only one active token per user.
6. Settings page gains `TelegramLinkSection` (link status read, generate-token mutation, instructions block with `t.settings.telegram.*` keys).
7. Migrate `balance.ts` and both `env.botUserId` usages in `recordTransaction.ts` to `ctx.userId`. Inside conversations, capture `ctx.userId` in the outer middleware context and reference the captured value (or wrap reads in `conversation.external()`) so replays stay deterministic.
8. `env.myTelegramId` stays as an additional whitelist during rollout (allow linked OR whitelisted), removed in a follow-up change once the founding user is linked.

## Affected Areas

| Area                                                                                     | Impact            | Description                                                                                     |
| ---------------------------------------------------------------------------------------- | ----------------- | ----------------------------------------------------------------------------------------------- |
| `packages/api/src/telegram/context.ts`                                                   | Modified          | Add `userId: string` to `BotContext`.                                                           |
| `packages/api/src/telegram/middleware/auth.ts`                                           | Modified          | Replace hardcoded `env.myTelegramId` check with link lookup; whitelist coexists during rollout. |
| `packages/api/src/telegram/commands/start.ts`                                            | New               | `/start <token>` handler consuming token and persisting link.                                   |
| `packages/api/src/telegram/commands/index.ts`                                            | Modified          | Register `start` command.                                                                       |
| `packages/api/src/telegram/commands/balance.ts`                                          | Modified          | `env.botUserId` → `ctx.userId`.                                                                 |
| `packages/api/src/telegram/conversations/recordTransaction.ts`                           | Modified          | `env.botUserId` ×2 → captured `ctx.userId`.                                                     |
| `packages/api/src/telegram/ports/TelegramLinkRepository.ts`                              | New               | Port: `findByTelegramId(telegramId)`, `save(link)`.                                             |
| `packages/api/src/telegram/ports/TelegramLinkTokenRepository.ts`                         | New               | Port: `create(userId, token, ttl)`, `consume(token)`.                                           |
| `packages/api/src/adapters/dynamodb/repositories/DynamoDBTelegramLinkRepository.ts`      | New               | Adapter on existing single-table.                                                               |
| `packages/api/src/adapters/dynamodb/repositories/DynamoDBTelegramLinkTokenRepository.ts` | New               | Adapter; TTL via `ttl` attribute.                                                               |
| `packages/api/src/adapters/dynamodb/keyBuilders.ts`                                      | Modified          | Add `telegramPK`, `telegramLinkSK`, `telegramTokenSK`.                                          |
| `packages/api/src/composition/container.ts`                                              | Modified          | Wire 2 new repos; remove `env.botUserId`.                                                       |
| `packages/api/src/handlers/telegram/generateLinkToken.ts`                                | New               | REST handler `withErrorHandler(withAuth(...))`.                                                 |
| `packages/infra-sls/src/handlers/telegram/generateLinkToken.ts`                          | New               | Proxy delegating to api handler.                                                                |
| `packages/infra-sls/serverless.yml`                                                      | Modified          | New `httpApi` route `POST /telegram/link-token` with `cognitoJwtAuthorizer`.                    |
| `packages/web/src/features/settings/components/TelegramLinkSection.tsx`                  | New               | UI for token generation + copy.                                                                 |
| `packages/web/src/features/settings/queries.ts`                                          | New (or Modified) | React Query mutation for `POST /telegram/link-token`.                                           |
| `packages/web/src/features/settings/pages/SettingsPage.tsx`                              | Modified          | Mount `TelegramLinkSection`.                                                                    |
| `packages/web/src/lib/i18n.ts`                                                           | Modified          | New `t.settings.telegram.*` keys.                                                               |
| `packages/api/src/env.ts`                                                                | Modified          | Remove `botUserId`; keep `myTelegramId` (deprecated, rollout).                                  |

## Risks

| Risk                                                                       | Likelihood | Mitigation                                                                                                                                                                                           |
| -------------------------------------------------------------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ctx.userId` undefined inside `recordTransaction` after grammy replay      | High       | Capture `ctx.userId` in the outer handler and close over it; wrap container calls in `conversation.external()`. Add typing assertion at conversation entry.                                          |
| Linking the wrong account if a user pastes someone else's token            | Med        | TTL 15 min, one-time use, token bound to `userId` partition so consume validates ownership. Document warning in copy.                                                                                |
| `env.myTelegramId` removed too early breaks operator access during rollout | Med        | Keep whitelist as additive condition (linked OR whitelisted) until founding user links; remove in a follow-up PR.                                                                                    |
| Concurrent token generation creates orphan tokens                          | Low        | Allow overwrite — `create()` upserts on `PK=USER#<userId>, SK=TELEGRAMTOKEN#<token>` keyed by the new token; old token simply expires via TTL. Document "one active token at a time" UX in settings. |
| Token leakage via clipboard or screen sharing                              | Low        | Short TTL (15 min) and one-time consume drastically limit blast radius; explicit copy step shown only once.                                                                                          |
| Token format parse failure leaks raw error to user                         | Low        | `/start` command validates `userId.token` shape before any DB call; respond with friendly error.                                                                                                     |
| Type drift between `BotContext` and inner conversation context             | Med        | Add explicit `BotContext` import in conversation file; tsc strict catches missing fields; add test in spec phase.                                                                                    |

## Rollback Plan

1. Revert the feature branch — bot returns to single-user mode immediately (auth middleware reads `env.myTelegramId` again, `env.botUserId` is restored).
2. Optionally delete the new items from DynamoDB (`PK begins_with TELEGRAM#` and `SK begins_with TELEGRAMTOKEN#`) — they are harmless if left behind because nothing reads them after rollback.
3. Remove `POST /telegram/link-token` route by re-deploying serverless from the reverted commit; no resource teardown required (no new table, no new IAM beyond existing single-table policy).
4. No data migration on existing wallets/transactions — they are keyed by `userId` already.

## Dependencies

- Cognito user pool must exist (already provisioned by `settings` change).
- Existing single-table IAM policy on the bot Lambda (`GetItem`, `PutItem`, `DeleteItem`) — already in place per exploration.
- `crypto.randomBytes` (Node 22 stdlib) — no new package.
- No new infra resources required.

## Success Criteria

- [ ] A second Cognito user can generate a token from Settings and link Telegram via `/start <token>` in under 1 minute.
- [ ] After linking, `/balance`, `/nuevo`, and existing conversations operate on the linked user's wallets only — verified by linking two users to two different bots-of-record and confirming isolation.
- [ ] Removing `env.botUserId` from the deployment does not break any command (greps clean: no `env.botUserId` references remain).
- [ ] An unlinked Telegram user receives the linking instructions message and the bot performs no DB writes for that user.
- [ ] A consumed token cannot be reused (second `/start <token>` returns "token invalid or expired").
- [ ] Tokens disappear from DynamoDB within ~15 min of creation if not consumed (TTL attribute set correctly).
- [ ] `tsc --noEmit` passes in `packages/api` and `packages/web` after the change.
- [ ] CDK / Serverless deploy succeeds with no new resources beyond the new HTTP route.
