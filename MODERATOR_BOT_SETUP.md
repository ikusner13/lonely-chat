# Moderator Bot Setup Guide

This guide explains how to set up and use the moderator bot with proper Twitch OAuth scopes and Twurple intents.

## Understanding Scopes vs Intents

### Scopes (Twitch OAuth Permissions)

- **What they are**: Permissions that define what your bot can do via Twitch API
- **Examples**: `chat:read`, `chat:edit`, `moderator:manage:banned_users`
- **When used**: When generating OAuth tokens

### Intents (Twurple Labels)

- **What they are**: Labels to identify different user accounts in your auth system
- **Examples**: `['chat']`, `['moderator']`, `['chatBotFor123456:']`
- **When used**: When adding users to RefreshingAuthProvider

## Setting Up a Moderator Bot

### 1. Generate a Moderator Token

First, generate a token with moderator scopes:

```bash
bun run generate-moderator-token moderator
```

This will request the following scopes:

- `chat:read` - Read chat messages
- `chat:edit` - Send chat messages
- `moderator:manage:banned_users` - Ban/timeout/unban users
- `moderator:manage:chat_messages` - Delete messages
- `moderator:manage:chat_settings` - Update chat settings
- `moderator:manage:shield_mode` - Enable/disable shield mode
- `moderator:manage:warnings` - Warn users
- `moderator:read:chatters` - See who's in chat
- `moderator:read:shield_mode` - Check shield mode status
- `moderator:read:followers` - View followers

### 2. Understanding How Intents Work

When you add a user to the auth provider:

```typescript
// Regular chat bot
await authProvider.addUserForToken(tokenData, ["chat"]);

// Moderator bot
await authProvider.addUserForToken(tokenData, ["moderator"]);

// Bot for specific streamer
await authProvider.addUserForToken(tokenData, [`chatBotFor:${streamerId}`]);

// Multiple intents
await authProvider.addUserForToken(tokenData, ["chat", "moderator"]);
```

When creating a client that needs specific intents:

```typescript
// Chat client that specifically needs moderator account
const chatClient = new ChatClient({
  authProvider: authProvider,
  authIntents: ["moderator"], // Will use account with 'moderator' intent
});
```

### 3. Example Integration

```typescript
import { ModeratorBotService } from "./services/moderator-bot.service";
import { TwitchChatBot } from "./services/chatbot.service";
import { TokenService } from "./services/token.service";

// Load tokens
const tokenService = new TokenService();

// Regular bot setup
const chatBotToken = tokenService.getBotToken("friendly");
const chatBot = new TwitchChatBot(
  process.env.TWITCH_CLIENT_ID!,
  process.env.TWITCH_CLIENT_SECRET!,
  chatBotToken
);
await chatBot.initialize(); // This adds user with ['chat'] intent

// Moderator bot setup
const modBotToken = tokenService.getBotToken("moderator");
const modBot = new ModeratorBotService(
  process.env.TWITCH_CLIENT_ID!,
  process.env.TWITCH_CLIENT_SECRET!,
  process.env.TWITCH_CHANNEL_NAME!,
  modBotToken
);
await modBot.initialize(); // This adds user with ['moderator'] intent

// Both bots can now operate independently
// The auth provider knows which account to use based on intents
```

### 4. Important Notes

1. **Same Account, Different Intents**: You can add the same Twitch account multiple times with different intents:

   ```typescript
   // Same token, different purposes
   await authProvider.addUserForToken(tokenData, ["chat"]);
   await authProvider.addUserForToken(tokenData, ["moderator"]);
   ```

2. **Intent Fallback**: If a client requests an intent that doesn't exist, it will fall back to any available user.

3. **Scopes Determine Capabilities**: Intents are just labels. The actual permissions come from the OAuth scopes in the token.

4. **Bot Must Be Moderator**: For moderation commands to work, the bot account must be a moderator in the channel. Having the scopes isn't enough!

### 5. Common Patterns

```typescript
// Check if token has moderation capabilities
const hasModScopes = tokenData.scope?.some((scope) =>
  scope.startsWith("moderator:")
);

// Add intents based on capabilities
const intents = ["chat"];
if (hasModScopes) {
  intents.push("moderator");
}
await authProvider.addUserForToken(tokenData, intents);

// Create specialized clients
const modClient = new ChatClient({
  authProvider,
  authIntents: ["moderator"], // Prefer moderator account
});
```

## Troubleshooting

### "Invalid scope" error

- Make sure you're using real Twitch OAuth scopes, not made-up ones
- Check available scopes at: https://dev.twitch.tv/docs/authentication/scopes

### Bot can't timeout/ban users

- Ensure the bot account is a moderator in the channel
- Verify the token has the required scopes
- Check that you're using the correct intent when creating clients

### Multiple accounts confusion

- Use clear, distinct intents for different purposes
- Consider using different bot accounts for different roles
- Log which account is being used for debugging
