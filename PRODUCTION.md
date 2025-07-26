# Production Deployment Guide

## Token Management

Tokens are stored in a SQLite database for easy management and persistence.

### Environment Variables

Required:

- `TWITCH_CLIENT_ID` - Your Twitch application client ID
- `TWITCH_CLIENT_SECRET` - Your Twitch application client secret
- `TWITCH_CHANNEL_ID` - The channel ID to monitor
- `TWITCH_CHANNEL_NAME` - The channel name
- `OPENROUTER_KEY` - Your OpenRouter API key

Optional:

- `TOKEN_DB_PATH` - Path to SQLite database (default: `./tokens.db`)

### Docker Deployment

1. Create a `.env` file with your secrets:

```env
TWITCH_CLIENT_ID=your_client_id
TWITCH_CLIENT_SECRET=your_client_secret
TWITCH_CHANNEL_ID=your_channel_id
TWITCH_CHANNEL_NAME=your_channel_name
OPENROUTER_KEY=your_openrouter_key
```

2. Deploy with Docker Compose:

```bash
docker-compose up -d
```

The database will be persisted in a Docker volume at `/data/tokens.db`.

### Direct Deployment

1. Set environment variables
2. Generate tokens using the auth dashboard:

```bash
bun run auth
```

3. Run the application:

```bash
bun run start
```

### Database Backup

To backup your token database:

```bash
# Docker
docker-compose exec twitch-bot cp /data/tokens.db /data/tokens.db.backup

# Direct
cp tokens.db tokens.db.backup
```

### Migrating from JSON tokens

If you have existing `tokens.json`:

1. The app will automatically check for `tokens.json` on startup
2. Tokens will be imported to the database
3. Remove `tokens.json` after verification
