# Design: Telegram Multi-User Support

## Technical Approach

Token-based linking on the existing single-table. Two new ports (`TelegramLinkRepository`, `TelegramLinkTokenRepository`) follow the established hexagonal pattern (ports under `telegram/ports/`, adapters under `adapters/dynamodb/repositories/`, wired in `container.ts`). `BotContext` gains `userId`, populated per-update by `userResolverMiddleware` via a single `GetItem` on `PK=TELEGRAM#<telegramId>, SK=LINK`. Conversations capture `userId` by closure at entry. A new REST endpoint `POST /telegram/link-token` generates a `<userId>.<32-hex>` token persisted with TTL=900s. `/start <token>` parses the userId prefix and performs an atomic fetch-and-delete.

## Architecture Decisions

### Decision 1: `ctx.userId` inside conversations — closure capture

**Choice**: Capture `ctx.userId` ONCE in the outer handler before `createConversation` enters, and pass it via closure into the conversation factory.

**Alternatives**: (a) Re-resolve via `conversation.external(() => linkRepo.findByTelegramId(...))` on every container call. (b) Mutate inner `Context` type.

**Rationale**: The conversation factory is invoked from the outer `BotContext` middleware; we already have `ctx.userId` resolved. Closure capture is deterministic on grammy replay (the value was frozen at conversation entry) and avoids N extra DB lookups per multi-step flow. Pattern: change `recordTransaction(type?)` to `recordTransaction(userId, type?)` and instantiate it inside `bot.command('nuevo')` rather than at module scope. The `createConversation(...)` registration must therefore move from `bot.ts` module-scope to a factory called per-enter, OR use a thin adapter that reads userId off a per-update conversation slot. We choose the **factory-per-enter** path because it keeps types tight and avoids any inner-context mutation.

### Decision 2: `env.myTelegramId` fallback during rollout

**Choice**: Additive whitelist — if link lookup misses BUT `ctx.from.id === env.myTelegramId`, set `ctx.userId = env.botUserId` and continue. Logged as `[telegram] using legacy whitelist`.

**Alternatives**: (a) DB-first only, force operator to link. (b) Whitelist as parallel always-on superuser.

**Rationale**: Founding operator must keep working through deploy. Linked-OR-whitelisted is the simplest predicate; the env-var path is removed in a follow-up change once the operator has linked. We do NOT treat the whitelist as a permanent superuser — that would create two paths to maintain forever.

### Decision 3: Atomic token consume

**Choice**: `DeleteCommand` with `ReturnValues: 'ALL_OLD'` plus `ConditionExpression: 'attribute_exists(PK) AND #ttl > :now'`.

**Alternatives**: (a) GetItem + DeleteItem (two round-trips, race window). (b) `TransactWriteItems` with `ConditionCheck + Delete` (overkill, 2x cost).

**Rationale**: Single round-trip, atomic, expired tokens fail the condition (TTL deletion can lag minutes). If `Attributes` is returned the token was valid and is now gone — one-time use is guaranteed by DynamoDB. Cleaner than transactions for a single-item op.

### Decision 4: One active token per user — overwrite

**Choice**: Token SK is `TELEGRAMTOKEN` (singleton per user, not `TELEGRAMTOKEN#<token>`). New generation overwrites; old token becomes unusable instantly.

**Alternatives**: Multiple tokens per user with token-suffixed SK and TTL cleanup.

**Rationale**: Simpler UX (regenerate = old invalid), no orphan tokens lingering 15min, no scan needed for "active token" queries. Aligns with proposal's single-active-token intent.

## Data Flow

    Web -> POST /telegram/link-token -> generate <userId>.<hex>
                                     -> Put PK=USER#u, SK=TELEGRAMTOKEN { token, ttl }
                                     -> return { token, expiresAt, botUsername }

    User -> /start <token> -> parse userId from prefix
                           -> Delete PK=USER#u, SK=TELEGRAMTOKEN cond(ttl>now), ALL_OLD
                           -> Put PK=TELEGRAM#tid, SK=LINK { userId, linkedAt }
                           -> reply success

    Update -> userResolverMiddleware -> Get PK=TELEGRAM#tid, SK=LINK -> ctx.userId
                                     -> [miss] env.myTelegramId? -> ctx.userId=env.botUserId
                                     -> [miss & no whitelist] reply "link first", stop

## File Changes

| File                                                                    | Action | Description                                                         |
| ----------------------------------------------------------------------- | ------ | ------------------------------------------------------------------- |
| `telegram/context.ts`                                                   | Modify | `BotContext = ConversationFlavor<Context> & { userId: string }`     |
| `telegram/middleware/auth.ts`                                           | Modify | Rename to `userResolverMiddleware`, DB lookup + fallback            |
| `telegram/commands/start.ts`                                            | Create | `/start <token>` handler                                            |
| `telegram/commands/balance.ts`                                          | Modify | `env.botUserId` → `ctx.userId`                                      |
| `telegram/conversations/recordTransaction.ts`                           | Modify | Accept `userId` as factory arg                                      |
| `telegram/commands/new.ts`                                              | Modify | Pass `ctx.userId` to `createConversation` per-enter                 |
| `telegram/bot.ts`                                                       | Modify | Remove module-scope `createConversation` for record                 |
| `telegram/ports/TelegramLinkRepository.ts`                              | Create | `findByTelegramId`, `save`                                          |
| `telegram/ports/TelegramLinkTokenRepository.ts`                         | Create | `create`, `consume`                                                 |
| `adapters/dynamodb/repositories/DynamoDBTelegramLinkRepository.ts`      | Create | GetItem/PutItem                                                     |
| `adapters/dynamodb/repositories/DynamoDBTelegramLinkTokenRepository.ts` | Create | Put + ConditionalDelete ALL_OLD                                     |
| `adapters/dynamodb/keyBuilders.ts`                                      | Modify | `telegramPK`, `telegramLinkSK`, `telegramTokenSK`                   |
| `adapters/dynamodb/index.ts`                                            | Modify | Re-export new repos + builders                                      |
| `composition/container.ts`                                              | Modify | Wire repos; expose `telegramLinkRepo`, `generateLinkToken` use-case |
| `handlers/telegram/generateLinkToken.ts`                                | Create | `withErrorHandler(withAuth(...))`                                   |
| `infra-sls/serverless.yml`                                              | Modify | `POST /telegram/link-token` + cognito authorizer                    |
| `web/src/features/settings/components/TelegramLinkSection.tsx`          | Create | UI                                                                  |
| `web/src/features/settings/queries.ts`                                  | Create | React Query mutation                                                |
| `web/src/lib/i18n.ts`                                                   | Modify | `t.settings.telegram.*`                                             |

## Interfaces

```ts
// telegram/ports/TelegramLinkRepository.ts
export interface TelegramLink {
  userId: string;
  telegramId: number;
  linkedAt: Date;
}
export interface TelegramLinkRepository {
  findByTelegramId(telegramId: number): Promise<TelegramLink | null>;
  save(link: TelegramLink): Promise<void>;
}

// telegram/ports/TelegramLinkTokenRepository.ts
export interface TelegramLinkToken {
  token: string;
  userId: string;
  expiresAt: Date;
}
export interface TelegramLinkTokenRepository {
  create(userId: string, ttlSeconds: number): Promise<TelegramLinkToken>;
  /** Returns userId on success, null if missing/expired. Atomic. */
  consume(token: string): Promise<string | null>;
}

// keyBuilders.ts
export const telegramPK = (telegramId: number) => `TELEGRAM#${telegramId}`;
export const telegramLinkSK = () => 'LINK';
export const telegramTokenSK = () => 'TELEGRAMTOKEN';
```

## Testing Strategy

| Layer       | What                                                                   | How                            |
| ----------- | ---------------------------------------------------------------------- | ------------------------------ |
| Unit        | Token format parse/validate; consume returns null on expired           | Vitest, in-memory repo fakes   |
| Adapter     | Conditional Delete returns ALL_OLD; expired → no attributes            | Vitest + dynamodb-local        |
| Integration | `/start <token>` full flow; `userResolverMiddleware` hit/miss/fallback | Mocked grammy ctx + repo fakes |

## Migration / Rollout

No data migration. Deploy adds new route + repos. Operator generates a token from Settings and runs `/start <token>` once; from then on the DB link wins. Whitelist env stays one release, removed in follow-up.

## Open Questions

- None blocking. Web UI copy/i18n keys deferred to `sdd-tasks` granularity.
