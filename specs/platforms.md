# Platforms

## Adapter Interface

Every platform implements a shared Effect service interface:

```typescript
interface PlatformAdapter {
  readonly platform: "twitch" | "kick";

  // Auth
  authorizeBot(botId: string): Effect<OAuthTokens, PlatformAuthError>;
  refreshToken(botId: string): Effect<OAuthTokens, PlatformAuthError>;

  // Connection
  connect(bot: BotConnection): Effect<void, PlatformConnectionError>;
  disconnect(bot: BotConnection): Effect<void>;

  // Chat
  sendMessage(channel: string, text: string): Effect<void, PlatformSendError>;

  // Listener (single per platform instance)
  listenChat(channel: string): Stream<ChatMessage>;

  // Stream status
  onStreamOnline(channel: string): Stream<StreamEvent>;
  onStreamOffline(channel: string): Stream<StreamEvent>;
}
```

Adding a new platform = implement this interface. The rest of the system (orchestrator, bots, UI) is platform-agnostic.

## Twitch

### Libraries

- **@twurple/auth** — OAuth token management, refresh flows
- **@twurple/chat** — IRC-based chat (send/receive messages)
- **@twurple/eventsub-ws** — WebSocket EventSub for stream online/offline

### Auth Flow

1. User clicks "Add Twitch Bot" in UI
2. App opens Twitch OAuth consent page (via localtunnel or configured redirect URI)
3. User authorizes the bot's Twitch account
4. Tokens stored in SQLite, auto-refreshed by Twurple

### Each bot needs:

- Separate Twitch account
- OAuth tokens with `chat:read` + `chat:edit` scopes
- The chat listener account needs additional scopes for reading

### Rate Limits

- 20 messages per 30 seconds (non-mod)
- 100 messages per 30 seconds (mod/VIP)
- Handled by the chatbot queue with per-bot tracking

## Kick

### Libraries

- **@nekiro/kick-api** — TypeScript, zero-dep, OAuth 2.1, auto-429 retry

### Auth Flow

1. Register app at kick.com developer portal
2. OAuth 2.1 flow — similar to Twitch but newer standard
3. Tokens stored in SQLite

### Each bot needs:

- Separate Kick account
- OAuth 2.1 tokens with `chat:write` scope
- `POST /chat` endpoint for sending messages

### Rate Limits

- Not publicly documented — API returns 429, library handles exponential backoff
- Our chatbot queue adds additional throttling as a safety net

## Stream Status Detection

### Auto-connect behavior:

1. App starts, bots are idle
2. Platform adapter detects stream goes online (EventSub for Twitch, polling for Kick)
3. Session starts automatically — bots connect and begin chatting
4. Stream goes offline — session ends, bots disconnect

### Manual override:

- "Start Session" / "Stop Session" buttons in UI
- Works regardless of stream status (for testing without actually streaming)

## Future Platforms

The adapter interface is designed for extension. Candidate platforms:

- YouTube Live (if quota issues are resolved)
- Discord (different model — server channels vs. stream chat)
- Custom/mock (for local testing without any platform connection)

A **mock adapter** that just echoes messages to the UI without connecting to any real platform would be valuable for development and demos.
