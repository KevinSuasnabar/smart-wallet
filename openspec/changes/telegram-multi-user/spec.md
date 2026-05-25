# Spec: Telegram Multi-User Support

---

## Domain: telegram-account-linking

### Purpose

Specify the token-based flow that allows an authenticated Smart Wallet web user to
permanently bind a Telegram account to their `userId`. Covers token generation,
one-time consumption with TTL enforcement, persistent link storage, and the
`/start <token>` bot command that finalises the binding.

---

## Requirements

### Requirement: REQ-LINK-01: Token Generation

The system MUST expose `POST /telegram/link-token` authenticated via
`cognitoJwtAuthorizer`. On success it MUST return `{ token, expiresAt, botUsername }`.
The token MUST follow the format `<userId>.<32-hex-chars>`. The token MUST be
persisted in DynamoDB with `ttl = floor(Date.now()/1000) + 900` (15 minutes).
Concurrent calls MUST overwrite the previous token — only one active token per
user is guaranteed.

#### Scenario: Authenticated user generates a token

- GIVEN a Cognito-authenticated web user is on the Settings page
- WHEN they call `POST /telegram/link-token`
- THEN the response is HTTP 200 with `{ token: "<userId>.<32-hex>", expiresAt: <ISO-string>, botUsername: <string> }`
- AND the token item appears in DynamoDB under `PK=USER#<userId>, SK=TELEGRAMTOKEN#<token-suffix>` with `ttl` set to ~15 minutes from now

#### Scenario: Unauthenticated request is rejected

- GIVEN a request without a valid Cognito JWT
- WHEN `POST /telegram/link-token` is called
- THEN the API Gateway returns HTTP 401 with no token generated or persisted

#### Scenario: Concurrent generation replaces previous token

- GIVEN a user has a valid unexpired token already stored
- WHEN they call `POST /telegram/link-token` again
- THEN the old token is replaced (the new token upserts the same user partition)
- AND the old token suffix becomes permanently invalid

---

### Requirement: REQ-LINK-02: Token TTL Expiry

The system MUST set the `ttl` attribute on every token item to `floor(Date.now()/1000) + 900`.
DynamoDB TTL MUST be enabled on the `ttl` attribute of the single-table. Tokens
not consumed within 15 minutes MUST be automatically deleted by DynamoDB TTL.

#### Scenario: Unexpired token survives for the duration

- GIVEN a token is created at epoch T
- WHEN epoch is T + 800 (before TTL)
- THEN the token item is still present in DynamoDB and is consumable

#### Scenario: Expired token is removed by DynamoDB TTL

- GIVEN a token is created with `ttl = T + 900`
- WHEN epoch exceeds T + 900
- THEN DynamoDB deletes the item (within DynamoDB's TTL sweep window)
- AND any subsequent `/start <token>` attempt returns "token invalid or expired"

---

### Requirement: REQ-LINK-03: Token Consumption via /start Command

The `/start <token>` bot command MUST parse `<userId>` from the token string,
perform a direct `GetItem` on `PK=USER#<userId>, SK=TELEGRAMTOKEN#<token-suffix>`
(no scan, no GSI), and conditionally delete it (consume). On success it MUST
persist a permanent link at `PK=TELEGRAM#<telegramId>, SK=LINK` with `{ userId, linkedAt }`,
then reply with a success message. The command MUST reject malformed tokens,
expired tokens, and tokens that have already been consumed — each with a distinct
user-friendly error message.

#### Scenario: Valid token links the account

- GIVEN an authenticated web user generated a token and has not yet linked Telegram
- WHEN they send `/start <userId>.<32-hex>` to the bot within 15 minutes
- THEN the bot performs GetItem + conditional DeleteItem on the token
- AND writes `PK=TELEGRAM#<telegramId>, SK=LINK` with `userId` and `linkedAt`
- AND replies with a success confirmation message

#### Scenario: Already-consumed token is rejected

- GIVEN a token was already consumed in a previous `/start` call
- WHEN the same token is sent again via `/start`
- THEN the bot replies with "token invalid or expired"
- AND no new link is written

#### Scenario: Malformed token string is rejected

- GIVEN a user sends `/start notavalidtoken` (no dot-separated userId prefix)
- WHEN the command handler parses the token
- THEN parsing fails before any DynamoDB call
- AND the bot replies with a friendly format-error message

#### Scenario: Expired token is rejected

- GIVEN a token's TTL has elapsed and DynamoDB has removed it
- WHEN the user sends `/start <token>`
- THEN GetItem returns no item
- AND the bot replies with "token invalid or expired"

#### Scenario: Already-linked Telegram account

- GIVEN the Telegram user already has a link record in DynamoDB
- WHEN they send `/start <token>`
- THEN the bot replies with "account already linked"
- AND the existing link is not overwritten

---

### Requirement: REQ-LINK-04: Permanent Link Storage

A successful token consumption MUST produce a permanent DynamoDB item at
`PK=TELEGRAM#<telegramId>, SK=LINK` with attributes `userId (S)`, `telegramId (S)`,
and `linkedAt (S, ISO-8601)`. No TTL attribute MUST be set on this item.

#### Scenario: Link item schema is correct

- GIVEN a successful `/start <token>` command
- WHEN the link item is inspected in DynamoDB
- THEN it has exactly `PK=TELEGRAM#<telegramId>`, `SK=LINK`, `userId`, `telegramId`, `linkedAt`
- AND no `ttl` attribute is present

---

### Requirement: REQ-LINK-05: Settings UI — TelegramLinkSection

The Settings page MUST include a `TelegramLinkSection` component. It MUST display
the current link status (linked/unlinked). When unlinked it MUST show a
"Generate token" CTA that triggers `POST /telegram/link-token`. After token
generation it MUST display the token string with a copy-to-clipboard action and
an expiry hint. All visible strings MUST use `t.settings.telegram.*` i18n keys.

#### Scenario: Unlinked state shows CTA

- GIVEN the user has no Telegram link
- WHEN the Settings page loads
- THEN `TelegramLinkSection` renders with a "Generate token" button visible
- AND no token string or copy button is shown

#### Scenario: Token generated — copy flow

- GIVEN the user clicks "Generate token"
- WHEN the mutation succeeds
- THEN the token string is displayed alongside a copy-to-clipboard button
- AND an expiry hint (e.g. "expires in 15 minutes") is shown
- AND the "Generate token" button is replaced or disabled

#### Scenario: No hardcoded strings in JSX

- GIVEN the component is rendered
- WHEN any visible text is inspected
- THEN every string traces back to a `t.settings.telegram.*` key in `lib/i18n.ts`

---

## Domain: telegram-user-resolution

### Purpose

Specify the per-update resolution of `BotContext.userId` from the persistent
Telegram link, replacing the hardcoded `env.myTelegramId` whitelist. Covers the
`userResolverMiddleware`, context typing, conversation determinism, and the
backward-compatible whitelist coexistence during rollout.

---

## Requirements

### Requirement: REQ-RESOLVE-01: BotContext Extended with userId

`BotContext` in `packages/api/src/telegram/context.ts` MUST include `userId: string`
as a required field. All command handlers and conversation functions MUST consume
`ctx.userId` instead of `env.botUserId`. The `env.botUserId` variable MUST be
removed from `env.ts`.

#### Scenario: Type-safe userId on context

- GIVEN `BotContext` is updated to include `userId: string`
- WHEN TypeScript compiles `packages/api` with `tsc --noEmit`
- THEN zero type errors are emitted related to `ctx.userId` access

#### Scenario: No env.botUserId references remain

- GIVEN the change is applied
- WHEN the codebase is grepped for `env.botUserId` or `botUserId`
- THEN zero matches are found in `packages/api/src`

---

### Requirement: REQ-RESOLVE-02: userResolverMiddleware

The system MUST replace `authMiddleware` with `userResolverMiddleware`. The
middleware MUST perform a single `GetItem` on `PK=TELEGRAM#<ctx.from.id>, SK=LINK`.
On hit it MUST set `ctx.userId` to the stored `userId` and call `next()`. On miss
it MUST check the `env.myTelegramId` additive whitelist; if the incoming
`ctx.from.id` matches, it MUST still call `next()` (using a fallback userId
from the whitelist or env). On miss with no whitelist match it MUST reply with
linking instructions and MUST NOT call `next()`.

#### Scenario: Linked user passes middleware

- GIVEN `TELEGRAM#<telegramId>, SK=LINK` exists in DynamoDB with `userId = "u-123"`
- WHEN an update arrives from that telegramId
- THEN middleware sets `ctx.userId = "u-123"` and calls `next()`

#### Scenario: Whitelisted fallback (env.myTelegramId) passes middleware

- GIVEN `env.myTelegramId` matches the incoming `ctx.from.id`
- AND no link record exists for that telegramId
- WHEN an update arrives
- THEN middleware allows the update through (calls `next()`)

#### Scenario: Unlinked, non-whitelisted user is blocked

- GIVEN no link record exists and `ctx.from.id` does not match `env.myTelegramId`
- WHEN any update arrives
- THEN middleware replies with linking instructions
- AND does NOT call `next()`
- AND no DB writes occur for that update

#### Scenario: update with no from field is rejected

- GIVEN an update arrives with `ctx.from` undefined (e.g., channel post)
- WHEN the middleware processes it
- THEN the middleware does NOT call `next()` and performs no DB operations

---

### Requirement: REQ-RESOLVE-03: Conversation Determinism with ctx.userId

Inside conversation functions, `ctx.userId` MUST be captured from the outer
middleware context before the first `conversation.wait()` call, and the captured
value MUST be used for all subsequent container calls. All container calls inside
the conversation MUST remain wrapped with `conversation.external()`. This ensures
grammy replays do not re-execute the DB lookup on every step.

#### Scenario: userId is captured before first await

- GIVEN a user enters the `recordTransaction` conversation
- WHEN the conversation function begins
- THEN `ctx.userId` is read once and stored in a local variable
- AND all subsequent `container.*` calls use the captured local, not `ctx.userId`

#### Scenario: Replay does not re-execute the DB lookup

- GIVEN the conversation is restored from session and replayed to the current step
- WHEN the replay re-runs the conversation function
- THEN no additional DynamoDB reads for user resolution occur
- AND no duplicate writes are produced

---

### Requirement: REQ-RESOLVE-04: Key Builders for Telegram Entities

`packages/api/src/adapters/dynamodb/keyBuilders.ts` MUST export three new functions:
`telegramPK(telegramId: string): string`, `telegramLinkSK(): string`, and
`telegramTokenSK(tokenSuffix: string): string`. No PK or SK string for Telegram
entities MUST be constructed outside of these builders.

#### Scenario: Key builders produce correct strings

- GIVEN `telegramId = "98765"` and `tokenSuffix = "abc123"`
- WHEN the builders are called
- THEN `telegramPK("98765")` returns `"TELEGRAM#98765"`
- AND `telegramLinkSK()` returns `"LINK"`
- AND `telegramTokenSK("abc123")` returns `"TELEGRAMTOKEN#abc123"`

#### Scenario: No hardcoded PK/SK strings in adapters

- GIVEN the DynamoDB adapters for Telegram entities are implemented
- WHEN the adapter files are inspected
- THEN all PK and SK values come exclusively from `keyBuilders.ts` imports

---

### Requirement: REQ-RESOLVE-05: Port Contracts

`TelegramLinkRepository` MUST declare `findByTelegramId(telegramId: string): Promise<TelegramLink | null>`
and `save(link: TelegramLink): Promise<void>`.
`TelegramLinkTokenRepository` MUST declare `create(userId: string, token: string, ttl: number): Promise<void>`
and `consume(userId: string, tokenSuffix: string): Promise<boolean>` (returns
`true` if token was found and deleted, `false` if not found).
Both ports MUST live in `packages/api/src/telegram/ports/` with no infrastructure imports.

#### Scenario: Ports compile without AWS SDK imports

- GIVEN `TelegramLinkRepository.ts` and `TelegramLinkTokenRepository.ts` exist
- WHEN each file is inspected for imports
- THEN no `@aws-sdk/*` or DynamoDB references are present in either port file

#### Scenario: consume returns false for missing token

- GIVEN no token item exists for `(userId, tokenSuffix)`
- WHEN `consume(userId, tokenSuffix)` is called on the DynamoDB adapter
- THEN it returns `false` and no delete is attempted

---

### Requirement: REQ-RESOLVE-06: Infrastructure Route

`serverless.yml` MUST declare `POST /telegram/link-token` as an `httpApi` event
with `authorizer: cognitoJwtAuthorizer`. The route MUST proxy to `generateLinkToken`
handler in `packages/infra-sls/src/handlers/telegram/generateLinkToken.ts`. No
new DynamoDB table or IAM statement beyond the existing single-table policy is
required.

#### Scenario: Route rejects unauthenticated calls at gateway level

- GIVEN no Authorization header is sent
- WHEN `POST /telegram/link-token` is called
- THEN API Gateway returns HTTP 401 before the Lambda is invoked

#### Scenario: Route invokes handler for authenticated calls

- GIVEN a valid Cognito JWT is provided
- WHEN `POST /telegram/link-token` is called
- THEN the Lambda handler is invoked and generates a token

---

### Requirement: REQ-RESOLVE-07: env.botUserId Removal

`env.botUserId` MUST be removed from `packages/api/src/env.ts`. `env.myTelegramId`
MUST remain (deprecated, kept for rollout whitelist). After this change `tsc --noEmit`
MUST pass in `packages/api`.

#### Scenario: botUserId is absent from env.ts

- GIVEN the change is applied
- WHEN `packages/api/src/env.ts` is read
- THEN `botUserId` is not declared or referenced

#### Scenario: myTelegramId still present for rollout

- GIVEN the change is applied
- WHEN `packages/api/src/env.ts` is read
- THEN `myTelegramId` is still present and typed as `number`
