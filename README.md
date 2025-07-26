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

#### Using the Auth Dashboard (Recommended)

The easiest way to manage tokens is through the unified auth dashboard:

```bash
bun run auth
```

This will:
1. Start a local server at http://localhost:8080
2. Create a secure tunnel for OAuth callbacks
3. Open your browser to the auth dashboard

From the dashboard you can:
- Generate a channel token (for EventSub monitoring)
- Add regular bot tokens (for chat participation)
- Add moderator bot tokens (with timeout capabilities)
- View token status and expiration times
- Refresh expired tokens
- Delete unused tokens

**Important**: Make sure your Twitch app's redirect URI is set to the tunnel URL shown in the dashboard (e.g., `https://your-subdomain.loca.lt/callback`).

##### Examples:

**Adding a Channel Token:**
1. Click "Generate Channel Token" on the dashboard
2. Log in with your main Twitch channel account (not a bot account)
3. Authorize the permissions
4. The token will be saved and shown as "Active" in the Channel Token section

**Adding a Regular Bot:**
1. In the "Bot Tokens" section, enter a bot name (e.g., "funnybot") in the first input field
2. Click "Add Regular Bot"
3. Log in with the bot's Twitch account
4. Authorize the permissions (chat:read, chat:edit)
5. The bot will appear in your bot list with an "Active" status

**Adding a Moderator Bot:**
1. In the "Bot Tokens" section, enter a bot name (e.g., "modbot") in the second input field
2. Click "Add Moderator Bot"
3. Log in with the bot's Twitch account (must have moderator status in your channel)
4. Authorize the permissions (includes moderator:manage:banned_users)
5. The bot will appear with a shield icon 🛡️ indicating moderator capabilities

#### Using Individual Scripts (Legacy)

Alternatively, you can use the individual token generation scripts:

```bash
# Generate channel token
bun run generate-channel-token

# Generate bot tokens
bun run generate-token bot1
bun run generate-token bot2

# Generate moderator bot token
bun run generate-moderator-token modbot
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