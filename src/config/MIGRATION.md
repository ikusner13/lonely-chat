# Bot Config Migration Guide

## What Changed

1. **No more redundant `name` field** - The bot name is the object key
2. **Simpler imports** - Just import from `bot.config` instead of `bot.schema`
3. **Defaults applied automatically** - No need to specify common values
4. **Cleaner bot definitions** - Only specify what's different

## Import Changes

```typescript
// Old
import { BotName, getBotConfig, BOTS } from './bot.schema';

// New
import { BotName, getBotConfig, BOT_NAMES } from './bot.config';
```

## Type Changes

```typescript
// Old
type BotName = 'stickyman1776' | 'geneJacqueman' | ...

// New (automatically derived)
type BotName = keyof typeof BOTS;
```

## Adding a New Bot

```typescript
// Just add to BOTS object:
myNewBot: {
  systemPrompt: 'You are a helpful bot...',
  // Only override if different from defaults:
  // temperature: 0.5,  // default is 0.7
  // maxTokens: 200,    // default is 100
  // isModerator: true, // default is false
}
```

## Benefits

- ✅ No duplicate bot names
- ✅ Cleaner, more readable config
- ✅ Type safety maintained
- ✅ Easy to add/modify bots
- ✅ Defaults reduce boilerplate