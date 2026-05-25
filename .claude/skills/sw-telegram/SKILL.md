---
name: sw-telegram
description: "Trigger: Telegram bot, grammy, conversation, command, keyboard, bot handler, ctx.userId. Smart-wallet Telegram bot patterns."
license: MIT
metadata:
  author: smart-wallet
  version: "1.0"
---

## Activation Contract

Load when writing any Telegram bot code under `api/src/telegram/`.

## Hard Rules

- **ALL** container/IO calls inside a `conversation` handler MUST be wrapped in `conversation.external(async () => { ... })` — missing wrappers cause silent double-write bugs on grammy replay
- Use `ctx.userId` from context — never `env.botUserId` directly (single-user shortcut being migrated out)
- Auth middleware runs first: unrecognized users are silently dropped, `next()` is never called
- `BotContext = ConversationFlavor<Context>` — outer middleware context; conversation handler receives plain `Context`

## Registering a New Command

1. Create `api/src/telegram/commands/{name}.ts` — export `registerXCommand(bot: Bot<BotContext>)`
2. Add to `api/src/telegram/commands/index.ts` → `registerCommands()`
3. No other file needs changing for a simple command

## Registering a New Conversation

1. Create `api/src/telegram/conversations/{name}.ts` — export a factory that returns the conversation handler
2. In `api/src/telegram/bot.ts`: `bot.use(createConversation(myConversation(), 'name'))`
3. Enter from a command: `await ctx.conversation.enter('name')`

## File Layout

```
api/src/telegram/
  bot.ts                  ← bot setup, middleware, conversation registration
  context.ts              ← BotContext type
  middleware/auth.ts      ← drops unauthorized users silently
  commands/               ← one file per command, registered in index.ts
  conversations/          ← multi-step conversation handlers
  keyboards/              ← InlineKeyboard builders (pure functions)
  storage/                ← grammy session storage adapter (DynamoDB)
```

## Conversation Skeleton

```typescript
export const myConversation = () =>
  async (conversation: Conv, ctx: InnerCtx): Promise<void> => {
    await ctx.reply('First step...');

    // ALL I/O inside external()
    const data = await conversation.external(async () => {
      return container.someUseCase({ userId: ctx.userId });
    });

    const response = await conversation.waitFor('message:text');
    // ...
  };
```

## Keyboards

```typescript
// keyboards/{name}.ts — return InlineKeyboard, never call bot.api here
export function buildMyKeyboard(items: Item[]): InlineKeyboard {
  const kb = new InlineKeyboard();
  items.forEach(i => kb.text(i.label, i.id).row());
  return kb;
}
```
