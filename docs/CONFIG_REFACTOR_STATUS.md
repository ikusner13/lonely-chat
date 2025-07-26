# Bot Configuration Refactor - Status & Issues

## What Was Completed

### 1. External TOML Configuration
- Created `/config/bots.toml` with all bot configurations
- Bots load successfully from TOML file using Bun's native import
- Config volume mounts correctly in Docker (`./config:/config:ro`)

### 2. ConfigManager Service
- Created `src/services/config-manager.ts` with EventEmitter
- Loads config using: `await import(absolutePath)`
- Has file watcher using `fs.watch()` for config changes
- Emits `config:updated` event when changes detected

### 3. Service Updates
- All services updated to accept dynamic configs
- Bots stay connected during config updates (no disconnect/reconnect)
- Config updates flow through: ConfigManager → App → Services

### 4. Docker Support
- Container builds and runs successfully
- Config file is accessible inside container at `/config/bots.toml`
- Database issue resolved using `docker compose cp tokens.db twitch-bot:/data/tokens.db`

## Current Issues

### 1. Hot Reload in Docker
**Problem**: File watching doesn't work reliably in Docker containers
- Editing `/config/bots.toml` on host doesn't trigger reload in container
- File system events don't propagate from host → Docker volume → container

**Current Workaround**: Use `docker-compose restart` after config changes

**Possible Solutions**:
1. Edit file inside container to trigger watch event
2. Add HTTP endpoint to trigger config reload
3. Use process signals (SIGHUP) to trigger reload
4. Accept that restart is required for Docker

### 2. Import Path Resolution
- Config uses absolute path for import: `await import(absolutePath)`
- Works locally and in Docker after fixing path resolution

## Questions to Resolve

1. **Hot Reload Priority**: Is hot reload critical for Docker, or is restart acceptable?
2. **Preferred Reload Method**: If hot reload needed, which approach:
   - HTTP endpoint (e.g., POST /reload-config)
   - Signal handling (e.g., kill -HUP <pid>)
   - Other method?

## File Structure

```
/stream/
├── config/
│   ├── bots.toml          # Bot configurations
│   ├── bots.toml.example  # Example config
│   └── README.md          # Config documentation
├── src/
│   ├── services/
│   │   ├── config-manager.ts  # New config loading service
│   │   └── ...               # Updated services
│   └── app.ts               # Updated with ConfigManager
└── docker-compose.yml       # Updated with config volume
```

## Key Code Snippets

### ConfigManager Load Function
```typescript
private async loadConfig(): Promise<void> {
  try {
    const absolutePath = this.configPath.startsWith('/')
      ? this.configPath
      : `${process.cwd()}/${this.configPath}`;
    
    const imported = await import(absolutePath);
    this.config = { bots: imported.bots } as ConfigFile;
    
    this.logger.info(`Loaded ${this.config.bots.length} bots from config`);
  } catch (error) {
    this.logger.error({ err: error }, 'Failed to load config');
    this.emit('config:error', error as Error);
  }
}
```

### Docker Compose Config Mount
```yaml
volumes:
  - bot-data:/data
  - ./config:/config:ro  # Read-only mount
environment:
  - BOT_CONFIG_PATH=/config/bots.toml
```

## Next Steps

1. Decide on hot reload approach for Docker
2. Implement chosen solution (if needed)
3. Update documentation with final approach
4. Test complete workflow in production environment