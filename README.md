# Lonely Chat

AI-powered Twitch chat bots that create engaging, personality-driven conversations in stream chats.

## What it does

- Multiple AI bots with distinct personalities join your Twitch chat
- Bots respond to @mentions and randomly participate (25% chance)
- Moderator bot with timeout capabilities
- Auto-connect when stream goes online, disconnect when offline
- Hot-reload bot config via SIGHUP (no downtime)
- Auth dashboard for OAuth token management

## Stack

- **Effect v4** -- services, layers, PubSub, Queue, Schema, SQL
- **Twurple** -- Twitch IRC, API, EventSub
- **Vercel AI SDK v5** + OpenRouter -- multi-model AI
- **Hono** -- auth dashboard + API
- **SQLite** -- token persistence
- **TOML** -- bot configuration

## Setup

```bash
pnpm install
```

Create `.env`:

```env
TWITCH_CLIENT_ID=your_client_id
TWITCH_CLIENT_SECRET=your_client_secret
TWITCH_CHANNEL_ID=your_channel_id
TWITCH_CHANNEL_NAME=your_channel_name
OPENROUTER_KEY=your_openrouter_api_key
```

Optional: `TOKEN_DB_PATH`, `BOT_CONFIG_PATH`, `PORT`, `LOG_LEVEL`

## Commands

```bash
vp dev          # dev server
vp check        # format + lint + typecheck
vp lint         # lint only
vp fmt          # format only
vp pack         # production build
vp test         # run tests
```

## License

MIT
