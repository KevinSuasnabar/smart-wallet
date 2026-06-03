# Telegram Conversation Flow Specification

## Purpose

Specify the behavior of the guided multi-step conversational flow for recording
income and expense transactions via the Telegram bot. Covers the interaction
protocol, session persistence, keyboard constraints, error handling, and
infrastructure provisioning required by the change.

---

## Requirements

### REQ-CONV-01: Command Entrypoint

The system MUST replace the one-shot argument-parsing behavior of `/gasto` and
`/ingreso` with a call that enters the guided conversation. When invoked without
arguments, each command MUST initiate the four-step flow. The command handlers
MUST NOT perform any DynamoDB writes themselves.

#### Scenario: /gasto enters conversation

- GIVEN the bot is running and the user is authenticated
- WHEN the user sends `/gasto` (with no arguments)
- THEN the bot enters the `recordTransaction:expense` conversation and proceeds to Step 1

#### Scenario: /ingreso enters conversation

- GIVEN the bot is running and the user is authenticated
- WHEN the user sends `/ingreso` (with no arguments)
- THEN the bot enters the `recordTransaction:income` conversation and proceeds to Step 1

---

### REQ-CONV-02: Step 1 — Amount and Description

The system MUST prompt the user to provide an amount and optional description as
free text. The amount MUST match the pattern `^\d+(\.\d{1,2})?$`. If the
message does not match, the bot MUST reply with an error and re-prompt without
advancing the flow.

#### Scenario: Valid amount with description

- GIVEN the user is in Step 1 of the flow
- WHEN the user sends `50.50 almuerzo`
- THEN the bot accepts the input, stores amount=5050 cents and description="almuerzo", and advances to Step 2

#### Scenario: Valid amount without description

- GIVEN the user is in Step 1 of the flow
- WHEN the user sends `200`
- THEN the bot accepts the input, stores amount=20000 cents and description=null, and advances to Step 2

#### Scenario: Invalid amount format

- GIVEN the user is in Step 1 of the flow
- WHEN the user sends `abc` or `50.5.5`
- THEN the bot replies with a format error message and re-prompts Step 1 without advancing

---

### REQ-CONV-03: Step 2 — Wallet Selection

The system MUST call `listWallets(userId)` and display the results as an inline
keyboard. Each button label MUST be the wallet name and each `callback_data`
MUST follow the format `w:<walletId>` and MUST NOT exceed 64 bytes. If no
wallets exist, the bot MUST send an error message and abort the flow without any
DB write.

#### Scenario: Wallets available

- GIVEN the user is in Step 2 and has at least one wallet
- WHEN the inline keyboard is rendered
- THEN each button shows the wallet name and carries `callback_data` of the form `w:<uuid>`
- AND every `callback_data` value is ≤ 64 bytes

#### Scenario: User selects a wallet

- GIVEN the inline keyboard is displayed
- WHEN the user taps a wallet button
- THEN the bot stores the selected walletId and advances to Step 3

#### Scenario: No wallets exist

- GIVEN the user has no wallets
- WHEN the bot reaches Step 2
- THEN the bot sends an error message explaining no wallets were found
- AND the flow is aborted with no DB write

---

### REQ-CONV-04: Step 3 — Category Selection

The system MUST display categories filtered by transaction type (expense or
income) from `PREDEFINED_CATEGORIES` as an inline keyboard. Each button label
MUST be the category name and each `callback_data` MUST follow the format
`c:<categoryId>` and MUST NOT exceed 64 bytes.

#### Scenario: Expense category list

- GIVEN the flow type is `expense` and the user is in Step 3
- WHEN the keyboard is rendered
- THEN only categories with `type === "expense"` are shown (9 items)
- AND all `callback_data` values are ≤ 64 bytes

#### Scenario: Income category list

- GIVEN the flow type is `income` and the user is in Step 3
- WHEN the keyboard is rendered
- THEN only categories with `type === "income"` are shown (5 items)
- AND all `callback_data` values are ≤ 64 bytes

#### Scenario: User selects a category

- GIVEN the keyboard is displayed
- WHEN the user taps a category button
- THEN the bot stores the selected categoryId and advances to Step 4

---

### REQ-CONV-05: Step 4 — Confirmation

The system MUST display a summary of the collected data (amount, description,
wallet name, category name) and present two buttons: `[✅ Confirmar]` and
`[❌ Cancelar]`. Callback data for confirm MUST be `confirm` and for cancel
MUST be `cancel`.

#### Scenario: Confirmation summary displayed

- GIVEN the user has completed Steps 1–3
- WHEN Step 4 is reached
- THEN the bot sends a message showing the amount, description (if any), wallet name, and category name
- AND two inline buttons are shown: Confirmar and Cancelar

#### Scenario: User confirms

- GIVEN the confirmation message is displayed
- WHEN the user taps Confirmar
- THEN `addTransaction()` is called exactly once with the collected data
- AND on success the bot sends a success message and clears the session

#### Scenario: User cancels at Step 4

- GIVEN the confirmation message is displayed
- WHEN the user taps Cancelar
- THEN the bot sends a cancellation message and clears the session with no DB write

---

### REQ-CONV-06: Cancel from Any Step

The system MUST support cancellation from any step via the `/cancel` command.
Cancellation MUST clear the active conversation session and MUST NOT write any
transaction to DynamoDB.

#### Scenario: Cancel mid-flow

- GIVEN the user is at any step (1–4) of the flow
- WHEN the user sends `/cancel`
- THEN the bot sends a cancellation acknowledgement message
- AND the session is cleared with no transaction written

---

### REQ-CONV-07: Replay Safety

All calls to external services (`listWallets`, `addTransaction`, any other
container calls) inside the conversation function MUST be wrapped with
`conversation.external()`. The conversation MUST NOT produce observable side
effects when its steps are replayed by the grammy conversations engine.

#### Scenario: Replay does not double-write

- GIVEN a conversation is restored from session state and replayed
- WHEN the replay re-executes the conversation function up to the current step
- THEN no additional DynamoDB writes occur for steps already completed

---

### REQ-CONV-08: addTransaction Failure

If `addTransaction()` returns a failure result after the user confirms, the bot
MUST send an error message and MUST NOT clear the session, allowing the user to
retry confirmation.

#### Scenario: Transaction write fails

- GIVEN the user has tapped Confirmar
- WHEN `addTransaction()` returns `ok: false`
- THEN the bot sends an error message
- AND the session is preserved so the user can retry

---

### REQ-SESSION-01: Dedicated Sessions Table

The system MUST provision a separate DynamoDB table named
`smart-wallet-telegram-sessions-<stage>` exclusively for grammy session storage.
This table MUST NOT be the main single-table. The table schema MUST have PK =
`id` (String). A `ttl` attribute MUST be defined and DynamoDB TTL MUST be
enabled on it. Billing MUST be on-demand (PAY_PER_REQUEST).

#### Scenario: Session table exists independently

- GIVEN the CDK stack is deployed
- WHEN the main single-table and sessions table are inspected
- THEN they are two distinct DynamoDB tables with no shared keys or GSIs

#### Scenario: TTL enforces session expiry

- GIVEN a session item is written with `ttl = now + 600 seconds`
- WHEN 10 minutes elapse
- THEN DynamoDB automatically deletes the item

---

### REQ-SESSION-02: Hexagonal Session Storage Adapter

The system MUST define a `SessionRepository` port in `packages/domain/` that
declares read and write operations for session data without any infrastructure
dependency. The DynamoDB implementation MUST live in
`packages/api/src/adapters/dynamodb/` and MUST implement the port interface.
The grammy storage adapter shim MUST live in
`packages/api/src/telegram/storage/` and MUST delegate to the `SessionRepository`
port — it MUST NOT import from AWS SDK directly.

#### Scenario: Port defines the contract

- GIVEN the `SessionRepository` port exists in `packages/domain/`
- WHEN other packages import session operations
- THEN they import from the port, not from any DynamoDB adapter

#### Scenario: Adapter implements port

- GIVEN the `DynamoSessionRepository` adapter exists in `packages/api/`
- WHEN `saveSession(key, data, ttlSeconds)` is called
- THEN the adapter writes a DynamoDB PutItem to the sessions table with the correct TTL epoch value

#### Scenario: Session not found returns null

- GIVEN no session exists for a given key
- WHEN `getSession(key)` is called
- THEN the adapter returns `null`

---

### REQ-SESSION-03: Session TTL Value

The system MUST set the TTL value to `Math.floor(Date.now() / 1000) + 600` when
writing a session item. The TTL MUST be rewritten (refreshed) on every session
update.

#### Scenario: TTL is 10 minutes from write time

- GIVEN a session write is performed at epoch T
- WHEN the item is stored in DynamoDB
- THEN the `ttl` attribute equals `T + 600` (seconds)

---

### REQ-INFRA-01: Environment Variable

The system MUST expose the sessions table name via the environment variable
`TELEGRAM_SESSIONS_TABLE` in `serverless.yml`. The bot Lambda MUST read this
variable to construct the DynamoDB adapter. A local default value MUST be
provided for offline development.

#### Scenario: Env var present in Lambda

- GIVEN the Lambda function is deployed
- WHEN `process.env.TELEGRAM_SESSIONS_TABLE` is read
- THEN it resolves to the provisioned table name

---

### REQ-INFRA-02: IAM Permissions

The serverless IAM role MUST include `dynamodb:GetItem`, `dynamodb:PutItem`, and
`dynamodb:DeleteItem` on the sessions table ARN. No other actions are required
for session operations.

#### Scenario: Lambda can read and write sessions

- GIVEN the IAM role is deployed
- WHEN the Lambda writes or reads a session item
- THEN the operation succeeds without an authorization error

---

### REQ-INFRA-03: CDK Construct for Sessions Table

The system MUST introduce a new CDK construct (or inline resource) in
`SmartWalletStack` that provisions the sessions table with on-demand billing,
TTL enabled, and `RemovalPolicy.DESTROY` (sessions are ephemeral — no retention
needed). The sessions table name MUST be emitted as a CloudFormation output.

#### Scenario: CDK deploys sessions table

- GIVEN the CDK stack is synthesized
- WHEN CloudFormation is applied
- THEN the sessions table exists with TTL enabled and billing mode PAY_PER_REQUEST

---

### REQ-COMPAT-01: Backward Compatibility — Shortcut Removal

The one-shot argument form `/gasto <amount> <desc>` and
`/ingreso <amount> <desc>` SHALL be removed. Users MUST use the guided flow.
The default text handler MUST update its help text to reflect conversational-only
commands.

#### Scenario: Old shortcut no longer works

- GIVEN a user sends `/gasto 50 almuerzo` (with arguments)
- WHEN the command handler processes it
- THEN the bot ignores the arguments and enters the guided conversation flow from Step 1

#### Scenario: Help text updated

- GIVEN the default text handler
- WHEN an unrecognized message is received
- THEN the reply lists `/gasto` and `/ingreso` as interactive commands with no argument syntax

---

### REQ-CONTEXT-01: Extended Bot Context

The system MUST extend `BotContext` in `packages/api/src/telegram/context.ts`
with `ConversationFlavor` from `@grammyjs/conversations` and a `session` type
compatible with the conversations plugin. All command handlers and the bot
instance MUST use this extended context type.

#### Scenario: Type-safe context

- GIVEN `BotContext` is extended with `ConversationFlavor`
- WHEN a command handler accesses `ctx.conversation`
- THEN TypeScript resolves the type without errors in strict mode
