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

Optionalh

- `TOKEN_DB_PATH` - Path to SQLite database (default: `./tokens.db`)
- `BOT_CONFIG_PATH` - Path to bot configuration file (default: `./config/bots.toml`)

### Docker Deployment

1. Create a `.env` file with your secrets:

```env
TWITCH_CLIENT_ID=your_client_id
TWITCH_CLIENT_SECRET=your_client_secret
TWITCH_CHANNEL_ID=your_channel_id
TWITCH_CHANNEL_NAME=your_channel_name
OPENROUTER_KEY=your_openrouter_key
```

2. Configure your bots in `config/bots.toml` (see `config/bots.toml.example`)

3. Deploy with Docker Compose:

```bash
docker compose up -d
```

The database will be persisted in a Docker volume at `/data/tokens.db`.
Bot configuration is mounted from `./config:/config:ro` (read-only).

### Direct Deployment

1. Set environment variables
2. Configure your bots in `config/bots.toml`
3. Generate tokens using the auth dashboard:

```bash
bun run auth
```

4. Build and run the application:

```bash
# Build for production
bun run build

# Run the built application
NODE_ENV=production bun run dist/index.js
```

Or run directly without building:

```bash
NODE_ENV=production bun run src/index.ts
```

### Database Backup

To backup your token database:

```bash
# Docker
docker compose exec twitch-bot cp /data/tokens.db /data/tokens.db.backup

# Direct
cp tokens.db tokens.db.backup
```

### Migrating from JSON tokens

If you have existing `tokens.json`:

1. The app will automatically check for `tokens.json` on startup
2. Tokens will be imported to the database
3. Remove `tokens.json` after verification

## Configuration Management

### Live Configuration Updates

Update bot settings without restarting the container:

```bash
# Edit bot configuration
nano config/bots.toml

# Apply changes (bots stay connected)
npm run docker:reload
# or
docker compose kill -s HUP twitch-bot

# Verify reload succeeded
docker compose logs -f twitch-bot | grep -i config
```

### What Can Be Updated

- Bot personalities (system prompts)
- Temperature and model settings
- Token limits
- Fallback models
- Any bot configuration in `bots.toml`

### Configuration Safety

- Changes are validated before applying
- Invalid configs are rejected (bots keep running)
- No downtime or disconnections
- Errors are logged but don't crash the service

### Monitoring

Watch for these log messages:

```
# Success
📨 SIGHUP received - reloading configuration...
✅ Configuration reloaded successfully

# Error (bots continue with old config)
❌ Failed to reload configuration
```

## Production Tips

### Health Monitoring

Monitor the container health:

```bash
# Check if container is running
docker compose ps

# View recent logs
docker compose logs --tail 50 twitch-bot

# Follow logs in real-time
docker compose logs -f twitch-bot
```

### Automatic Restarts

The Docker container is configured with `restart: unless-stopped`, which means:

- Automatically restarts on crashes
- Restarts after system reboot
- Stays stopped if manually stopped

### Resource Limits

Consider adding resource limits in production:

```yaml
# docker-compose.yml
services:
  twitch-bot:
    # ... existing config ...
    deploy:
      resources:
        limits:
          memory: 512M
        reservations:
          memory: 256M
```

### Logging

Logs are configured with rotation to prevent disk fill:

- Max size: 10MB per file
- Max files: 3 (30MB total)

### Security

- Bot configuration is mounted read-only (`:ro`)
- Tokens are stored in SQLite with file permissions
- No ports are exposed by default
- Environment variables keep secrets out of code
