# Simple Dokploy Deployment Guide

You're right - PostgreSQL is overkill for storing a handful of OAuth tokens. Let's keep it simple with SQLite.

## Pre-Deployment: Prepare Your Config

Before deploying, create your bot configuration file locally:

1. Copy the example config:
   ```bash
   cp config/bots.toml.example config/bots.toml
   ```

2. Edit `config/bots.toml` with your bot personalities

## Quick Deployment Steps

### 1. Create Dokploy Application
- Click **"Create Application"**
- Type: **Docker Compose**
- Name: `twitch-bot`

### 2. Configure Source
- **Repository**: Your GitHub repo URL
- **Branch**: `main` (or your branch)
- **Compose Path**: `docker-compose.dokploy-simple.yml`

### 3. Add Environment Variables
In the Environment tab, add:
```env
TWITCH_CLIENT_ID=your_client_id
TWITCH_CLIENT_SECRET=your_client_secret
TWITCH_CHANNEL_ID=your_channel_id
TWITCH_CHANNEL_NAME=your_channel_name
OPENROUTER_KEY=your_openrouter_key
TWITCH_REDIRECT_URI=https://auth.yourdomain.com/callback
```

### 4. Configure Domain
- Go to **Domains** tab
- Click **"Add Domain"**
- Service Name: `auth-server`
- Port: `8080`
- Domain: `auth.yourdomain.com`
- Enable **HTTPS**

### 5. Update Twitch App
- Go to: https://dev.twitch.tv/console/apps
- Edit your app
- Set OAuth Redirect URL: `https://auth.yourdomain.com/callback`
- Save

### 6. Deploy
- Click **"Deploy"**
- Wait for build to complete
- Visit `https://auth.yourdomain.com` to generate tokens

## Important: Dokploy Volume Mounts

Dokploy uses a special `../files/` directory for persistent storage. The compose file is configured to:
- Store tokens in `../files/tokens/tokens.db`
- Read bot config from `../files/config/bots.toml`

After deployment, you'll need to upload your `bots.toml`:
1. Go to your application in Dokploy
2. Navigate to **Files** tab
3. Create folder: `config`
4. Upload your `bots.toml` file

## Why This Approach Works

- **SQLite is perfect** for ~10 tokens that rarely change
- **Persistent storage** via Dokploy's file system
- **No database management** overhead
- **Simple backups** - just download from Files tab
- **Fast and reliable** for this use case

## Troubleshooting

### Bots can't find config
- Check Files tab → `config/bots.toml` exists
- Redeploy after uploading config

### Tokens not persisting
- Ensure `tokens` folder exists in Files tab
- Check logs for SQLite write errors

That's it! No database services, no complexity - just your bots and tokens.