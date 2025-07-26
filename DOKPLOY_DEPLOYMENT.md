# Dokploy Deployment Guide for Twitch Bot

This guide walks you through deploying both the auth server and main bot application to Dokploy.

## Prerequisites

- Dokploy installed on your VPS
- GitHub repository with your bot code
- Twitch application credentials
- OpenRouter API key

## Step 1: Create a New Project in Dokploy

1. Log into your Dokploy dashboard
2. Click "Create Project"
3. Name it (e.g., "twitch-bot-system")

## Step 2: Add Environment Variables

In your Dokploy project settings, add these environment variables:

```env
# Twitch OAuth Credentials
TWITCH_CLIENT_ID=your_client_id
TWITCH_CLIENT_SECRET=your_client_secret
TWITCH_CHANNEL_ID=your_channel_id
TWITCH_CHANNEL_NAME=your_channel_name

# OpenRouter API Key (for AI responses)
OPENROUTER_KEY=your_openrouter_key

# Auth Server Settings (update with your actual domain)
TWITCH_REDIRECT_URI=https://auth.your-domain.com/callback
```

## Step 3: Add Application to Dokploy

1. In your project, click "Add Application"
2. Choose "Docker Compose" as the application type
3. Configure the following:

### Source Settings
- **Source Type**: Git
- **Repository**: Your GitHub repo URL
- **Branch**: main (or your default branch)
- **Build Path**: . (root directory)

### Docker Compose Settings
- **Compose File**: docker-compose.dokploy.yml
- **Service to Expose**: auth-server (for OAuth callbacks)

### Domain Configuration
1. Add a domain for the auth server:
   - Service: auth-server
   - Port: 8080
   - Domain: auth.your-domain.com (or use subdomain)
   - Enable HTTPS (recommended)

2. Update your Twitch app settings:
   - Go to https://dev.twitch.tv/console/apps
   - Update OAuth Redirect URL to: `https://auth.your-domain.com/callback`

## Step 4: Configure Persistent Storage

The deployment uses Docker volumes for persistent data:
- `tokens-data`: Stores OAuth tokens in SQLite database

These volumes are automatically created and managed by Dokploy.

## Step 5: Deploy the Application

1. Click "Deploy" in Dokploy
2. Monitor the deployment logs
3. Wait for both services to be healthy

## Step 6: Generate Initial Tokens

1. Access your auth server at `https://auth.your-domain.com`
2. Generate the required tokens:
   - **Channel Token**: For EventSub stream monitoring
   - **Bot Tokens**: For each bot in your configuration
   - **Moderator Token**: For the moderator bot (if using)

## Step 7: Configure Your Bots

1. Before deploying, ensure your `config/bots.toml` is configured
2. Example configuration:

```toml
[[bots]]
name = "assistant"
personality = "You are a helpful assistant in a Twitch chat..."
model = "claude-3-haiku-20240307"
temperature = 0.7
maxTokens = 150

[[bots]]
name = "comedian"
personality = "You are a witty comedian in a Twitch chat..."
model = "meta-llama/llama-3.1-8b-instruct"
temperature = 0.9
maxTokens = 100
```

## Step 8: Monitor Your Deployment

### View Logs
In Dokploy, you can view logs for each service:
- `auth-server`: OAuth and token generation logs
- `twitch-bot`: Bot activity and chat logs

### Health Checks
- Auth Server: `https://auth.your-domain.com/health`
- Both services have automatic restart on failure

### Update Bot Configuration
To update bot personalities without restarting:

1. Edit `config/bots.toml` in your repository
2. Push changes to GitHub
3. In Dokploy, run a custom command:
   ```bash
   docker compose -f docker-compose.dokploy.yml kill -s HUP twitch-bot
   ```

## Troubleshooting

### Auth Server Can't Be Accessed
- Check domain configuration in Dokploy
- Ensure port 8080 is exposed
- Verify SSL certificate if using HTTPS

### Bots Not Connecting
- Check if tokens are generated properly
- Verify all environment variables are set
- Check logs for connection errors

### Database Issues
- Ensure the `tokens-data` volume has proper permissions
- Check if SQLite database is accessible at `/data/tokens.db`

### Stream Not Detected
- Verify channel token has proper scopes
- Check TWITCH_CHANNEL_ID matches your actual channel

## Security Considerations

1. **Environment Variables**: Never commit secrets to Git
2. **Token Storage**: Tokens are stored in SQLite with file permissions
3. **Network**: Use HTTPS for auth server
4. **Updates**: Regularly update dependencies and base images

## Maintenance

### Backup Tokens
```bash
# SSH into your VPS
cd /var/lib/dokploy/projects/your-project-id
docker compose -f docker-compose.dokploy.yml exec twitch-bot cp /data/tokens.db /data/tokens.db.backup
```

### Update Application
1. Push changes to GitHub
2. In Dokploy, click "Redeploy"
3. Monitor deployment logs

### Scale Resources
If needed, add resource limits in docker-compose.dokploy.yml:
```yaml
deploy:
  resources:
    limits:
      memory: 512M
    reservations:
      memory: 256M
```