# Twitch Bot Service

A Twitch bot service that automatically connects/disconnects bots based on stream status using EventSub WebSocket.

## Features

- **Stream-aware bot management**: Bots automatically connect when stream goes online and disconnect when offline
- **Multi-bot support**: Manage multiple bots with different credentials
- **Token management**: OAuth flow for generating and storing tokens
- **EventSub WebSocket**: Real-time stream status monitoring

## Setup

### 1. Install Dependencies

```bash
bun install
```

### 2. Configure Environment

Create a `.env` file with your Twitch app credentials and channel information:

```env
TWITCH_CLIENT_ID=your_client_id
TWITCH_CLIENT_SECRET=your_client_secret
TWITCH_REDIRECT_URI=http://localhost:8080/callback

# Your channel information for EventSub monitoring
TWITCH_CHANNEL_ID=your_channel_user_id
TWITCH_CHANNEL_NAME=your_channel_username

# Required: Stable subdomain for localtunnel auth server
LOCALTUNNEL_SUBDOMAIN=my-twitch-auth

# OpenRouter API key for AI features
OPENROUTER_KEY=your_openrouter_api_key
```

You can find your user ID using the Twitch API or various online tools. The channel name is your Twitch username (without the # symbol).

### 3. Generate Tokens

First, generate channel tokens for EventSub WebSocket:

```bash
bun run generate-channel-token
```

Then generate tokens for each bot that will connect to your chat:

```bash
bun run generate-token bot1
bun run generate-token bot2
```

## Usage

Start the service:

```bash
bun run dev
```

The service will:
1. Connect to Twitch EventSub to monitor your channel
2. When your stream goes online, all configured bots connect to chat
3. When your stream goes offline, all bots disconnect

## Architecture

- `src/index.ts` - Main entry point
- `src/BotOrchestrator.ts` - Manages bots and EventSub monitoring
- `src/scripts/generate-channel-token.ts` - OAuth flow for channel token generation
- `src/scripts/generate-tokens.ts` - OAuth flow for bot token generation
- `tokens.json` - Stores authentication tokens for channel and bots

## Token Scopes

- **Channel Token**: User token for EventSub WebSocket (no special scopes needed for stream.online/offline)
- **Bot Tokens**: `chat:read`, `chat:edit` (for chat functionality)