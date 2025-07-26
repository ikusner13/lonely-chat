# Config Updates in Dokploy

Since you're using Dokploy, there are two ways to update your bot configuration:

## Method 1: Edit via Dokploy UI (Recommended)

1. **Go to your application** in Dokploy
2. **Navigate to Files tab**
3. **Open** `config/bots.toml`
4. **Edit** the configuration directly in the UI
5. **Save** the changes
6. **Reload the config** without restarting:
   ```bash
   # In Dokploy's terminal or your VPS SSH
   docker exec -it <container-name> kill -HUP 1
   ```

## Method 2: Local Edit + Git Push

1. **Edit** `config/bots.toml` locally
2. **Commit and push** to your repository
3. **Deploy** in Dokploy (this restarts the containers)

## Method 3: SSH + Signal (Quick Updates)

If you have SSH access to your VPS:

```bash
# 1. Edit the file directly on the server
ssh your-vps
cd /path/to/dokploy/projects/your-project/files/config
nano bots.toml

# 2. Send reload signal to the bot container
docker ps | grep twitch-bot  # Find container name
docker exec -it <container-name> kill -HUP 1
```

## How the Reload Works

The bot listens for SIGHUP signals:
- When received, it reloads `config/bots.toml`
- Updates bot personalities, temperatures, models
- No disconnection or message loss
- Takes effect immediately

## Monitoring Reload Success

Check the logs after sending SIGHUP:

```bash
# Via Dokploy UI: Check Logs tab
# Via SSH:
docker logs <container-name> --tail 50 | grep -i config
```

Success messages:
- `📨 SIGHUP received - reloading configuration...`
- `✅ Configuration reloaded successfully`

Error messages:
- `❌ Failed to reload configuration`
- Check logs for specific error details

## What Can Be Updated Live

✅ Can update without restart:
- Bot personalities (system prompts)
- Temperature settings
- Model selections
- Max tokens
- Fallback models

❌ Requires restart:
- Adding/removing bots
- Changing bot names
- Token changes

## Pro Tip: Add a Dokploy Command

In Dokploy, you can add a custom command for easy reloading:

1. Go to your application
2. Navigate to **Commands** tab
3. Add new command:
   - Name: `Reload Config`
   - Command: `kill -HUP 1`
   - Description: `Reload bot configuration without restart`

Now you can reload config with one click from Dokploy UI!