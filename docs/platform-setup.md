# Platform Setup

This guide is for the developer or operator running a Lonely Chat instance. It explains how to wire the app to Twitch and Kick so bot authorization and live chat delivery work.

## What you are setting up

Lonely Chat supports two live platforms:

- `twitch`
- `kick`

Each bot is a separate platform account. OAuth tokens are stored in the app's SQLite database after the bot is authorized through the web UI.

The app expects:

- platform app credentials in environment variables
- one redirect URI per platform
- one real account per bot
- an app URL that the platform can call back into

## Required environment variables

Set the variables for each platform you want to enable.

### Twitch

```bash
export TWITCH_CLIENT_ID="..."
export TWITCH_CLIENT_SECRET="..."
export TWITCH_REDIRECT_URI="http://localhost:5173/auth/twitch/callback"
```

### Kick

```bash
export KICK_CLIENT_ID="..."
export KICK_CLIENT_SECRET="..."
export KICK_REDIRECT_URI="http://localhost:5173/auth/kick/callback"
```

### Optional shared runtime variables

```bash
export TWITCH_CHANNEL_NAME="your-test-channel"
export OPENROUTER_KEY="..."
```

`TWITCH_CHANNEL_NAME` is the fallback stream channel if no channel has been saved in the app settings yet.

## Twitch setup

Use Twitch when you want bots to authorize through OAuth and send messages through Twitch chat.

### 1. Create a Twitch developer app

Create an app in Twitch's developer console and register the callback URL that matches `TWITCH_REDIRECT_URI`.

For local development, that is typically:

```text
http://localhost:5173/auth/twitch/callback
```

If you run the app on another host or port, use that exact URL instead.

### 2. Use the required Twitch scopes

The app currently requests these scopes:

- `chat:read`
- `chat:edit`

Do not register a different redirect URI or scope set unless you also change the code.

### 3. Create one Twitch account per bot

Each Twitch bot must have its own Twitch account. In the bot editor, the bot's `name` should match the platform username for the account you authorize.

### 4. Start the app and authorize from the UI

Run the app, open `/bots`, create or open a Twitch bot, and click **Authorize on Twitch**.

The UI sends the browser to:

```text
/auth/twitch/start?botId=<bot-id>
```

Twitch redirects back to:

```text
/auth/twitch/callback?code=...&state=<bot-id>
```

On success, Lonely Chat stores the access token, refresh token, expiry, and granted scopes in SQLite.

### 5. Verify with a live tracer message

From the Twitch bot panel in `/bots`, use **Send Test Message**. This exercises the stored token through the production Twitch chat client path.

## Kick setup

Use Kick when you want bots to authorize through OAuth 2.1 and send messages through Kick chat.

### 1. Create a Kick developer app

Create an app in Kick's developer portal and register the callback URL that matches `KICK_REDIRECT_URI`.

For local development, that is typically:

```text
http://localhost:5173/auth/kick/callback
```

### 2. Use the required Kick scopes

The app currently requests these scopes:

- `chat:write`
- `events:subscribe`

Kick authorization uses OAuth 2.1 with PKCE. The app generates the PKCE verifier and challenge for each authorization request.

### 3. Create one Kick account per bot

Each Kick bot must have its own Kick account. In the bot editor, the bot's `name` should match the platform username for the account you authorize.

### 4. Make the Kick webhook endpoint reachable

Kick live chat intake depends on webhook events reaching this route:

```text
/api/platforms/kick/events
```

For local work, that means exposing your app on a public HTTPS URL and making sure Kick can deliver webhook requests to:

```text
https://<your-public-host>/api/platforms/kick/events
```

The current code subscribes to the `chat.message.sent` event. It does not configure a callback URL in code, so your Kick app configuration must point webhook delivery at the route above.

### 5. Start the app and authorize from the UI

Run the app, open `/bots`, create or open a Kick bot, and click **Authorize on Kick**.

The UI sends the browser to:

```text
/auth/kick/start?botId=<bot-id>
```

That route creates a short-lived PKCE verifier cookie, redirects to Kick, then Kick redirects back to:

```text
/auth/kick/callback?code=...&state=...
```

On success, Lonely Chat exchanges the code, stores the token set in SQLite, and returns you to the bot panel.

### 6. Verify with a live tracer message

From the Kick bot panel in `/bots`, use **Send Test Message**. This exercises the stored token through Kick's production chat endpoint.

## UI flow for both platforms

The platform setup flow in the app is:

1. Open `/bots`.
2. Create a bot with the correct platform and username.
3. Click the platform authorization button.
4. Complete the provider's consent flow.
5. Return to `/bots`.
6. Send a test message.

If OAuth is blocked, the bot page also exposes a manual **Credential Metadata** form where you can save access token, refresh token, expiry time, and scopes directly.

## How the app decides whether a platform is enabled

The shared live platform adapter only enables a real platform when all three values exist for that platform:

- client ID
- client secret
- redirect URI

If any value is missing, the platform is treated as unconfigured and live connects or sends will fail for that platform.

## Stored credentials

After authorization, the app stores these values per bot in SQLite:

- `accessToken`
- `refreshToken`
- `expiresAt`
- `scopes`
- timestamps

Auth status in the UI is derived from whether those records exist and whether the stored expiry is still in the future.

## Common mistakes

- Redirect URI mismatch. The provider app config must exactly match `TWITCH_REDIRECT_URI` or `KICK_REDIRECT_URI`.
- Wrong bot username. The bot record should use the same account name you authorize on the platform.
- Missing Kick webhook reachability. Kick chat intake depends on `/api/platforms/kick/events` being reachable from Kick.
- Missing env vars. If any required platform env var is empty, that platform is not configured.
- Using one account for multiple bots. The design assumes a separate platform account per bot.

## Relevant code and specs

- [README](../README.md)
- [specs/platforms.md](../specs/platforms.md)
- [specs/overview.md](../specs/overview.md)
- [specs/bots.md](../specs/bots.md)
- [src/platforms/Services/twitch-platform-config.ts](../src/platforms/Services/twitch-platform-config.ts)
- [src/platforms/Services/kick-platform-config.ts](../src/platforms/Services/kick-platform-config.ts)
- [src/routes/auth/twitch/start/+server.ts](../src/routes/auth/twitch/start/+server.ts)
- [src/routes/auth/twitch/callback/+server.ts](../src/routes/auth/twitch/callback/+server.ts)
- [src/routes/auth/kick/start/+server.ts](../src/routes/auth/kick/start/+server.ts)
- [src/routes/auth/kick/callback/+server.ts](../src/routes/auth/kick/callback/+server.ts)
- [src/routes/api/platforms/kick/events/+server.ts](../src/routes/api/platforms/kick/events/+server.ts)
- [src/routes/bots/+page.svelte](../src/routes/bots/+page.svelte)
