# Configuration Reload Implementation with SIGHUP

## Overview

This document outlines the implementation of graceful configuration reloading using the SIGHUP signal pattern, following industry standards used by nginx, HAProxy, PostgreSQL, and other production services.

## Goals

1. Enable live configuration updates without restarting the container
2. Keep bots connected during config reload (zero downtime)
3. Provide simple, Docker-native reload mechanism
4. Handle errors gracefully without crashing the application
5. Follow established industry patterns

## Architecture

### Signal Flow

```
User edits config/bots.toml
    ↓
User runs: docker compose kill -s HUP twitch-bot
    ↓
Docker sends SIGHUP to container process (PID 1)
    ↓
Process SIGHUP handler triggered
    ↓
ConfigManager.loadConfig() called
    ↓
New config validated and loaded
    ↓
'config:updated' event emitted
    ↓
App updates all bot configurations
    ↓
Bots continue with new settings (no disconnect)
```

### Why SIGHUP?

- **Industry Standard**: Used by nginx, HAProxy, Apache, PostgreSQL for config reload
- **Docker Native**: `docker kill -s` command works out of the box
- **No Dependencies**: Built into Node.js process handling
- **Graceful**: Allows validation before applying changes

## Implementation Details

### 1. ConfigManager Updates

**File**: `src/services/config-manager.ts`

**Changes Required**:
- Make `loadConfig()` method public (currently private)
- Fix TOML import caching to ensure fresh config is loaded
- Preserve existing config on error

```typescript
public async loadConfig(): Promise<void> {
  try {
    const absolutePath = this.configPath.startsWith('/')
      ? this.configPath
      : `${process.cwd()}/${this.configPath}`;

    // Force re-import by adding timestamp query parameter
    const timestampedPath = `${absolutePath}?t=${Date.now()}`;
    
    // Clear any existing module cache
    const resolvedPath = require.resolve(absolutePath);
    delete require.cache[resolvedPath];
    
    const imported = await import(timestampedPath);
    const newConfig = { bots: imported.bots } as ConfigFile;

    // Validate before applying
    if (!(newConfig.bots && Array.isArray(newConfig.bots))) {
      throw new Error('Invalid config: missing bots array');
    }

    // Only update if validation passes
    this.config = newConfig;
    this.logger.info(`Loaded ${this.config.bots.length} bots from config`);
  } catch (error) {
    // Keep existing config on error
    this.logger.error({ err: error }, 'Failed to load config - keeping existing configuration');
    this.emit('config:error', error as Error);
  }
}
```

### 2. Signal Handlers

**File**: `src/index.ts`

**Add Signal Handling**:

```typescript
import { createLogger } from '@/utils/logger';
import { App } from './app';

const logger = createLogger('Main');
const app = new App();

async function start() {
  try {
    await app.start();
    logger.info('🚀 Twitch bot started successfully');
    
    // Setup signal handlers after successful start
    setupSignalHandlers();
  } catch (error) {
    logger.error({ err: error }, 'Failed to start app');
    process.exit(1);
  }
}

function setupSignalHandlers() {
  // SIGHUP for configuration reload
  process.on('SIGHUP', async () => {
    logger.info('📨 SIGHUP received - reloading configuration...');
    try {
      const configManager = app.getConfigManager();
      await configManager.loadConfig();
      configManager.emit('config:updated');
      logger.info('✅ Configuration reloaded successfully');
    } catch (error) {
      logger.error({ err: error }, '❌ Failed to reload configuration');
    }
  });

  // SIGTERM for graceful shutdown (Docker stop)
  process.on('SIGTERM', async () => {
    logger.info('📨 SIGTERM received - shutting down gracefully...');
    await gracefulShutdown();
  });

  // SIGINT for Ctrl+C (development)
  process.on('SIGINT', async () => {
    logger.info('📨 SIGINT received - shutting down gracefully...');
    await gracefulShutdown();
  });

  logger.info('Signal handlers registered (SIGHUP for reload, SIGTERM/SIGINT for shutdown)');
}

async function gracefulShutdown() {
  try {
    logger.info('Stopping application...');
    await app.destroy();
    logger.info('👋 Graceful shutdown complete');
    process.exit(0);
  } catch (error) {
    logger.error({ err: error }, 'Error during shutdown');
    process.exit(1);
  }
}

start();
```

### 3. App Class Updates

**File**: `src/app.ts`

**Add ConfigManager Getter**:

```typescript
export class App {
  // ... existing code ...

  // Add getter for signal handler access
  getConfigManager(): ConfigManager {
    return this.configManager;
  }
}
```

### 4. Docker Configuration

**File**: `docker-compose.yml`

Add helpful comments for users:

```yaml
services:
  twitch-bot:
    build: .
    environment:
      # ... existing env vars ...
    volumes:
      - bot-data:/data
      - ./config:/config:ro
    restart: unless-stopped
    
    # Configuration Reload Instructions:
    # After editing config/bots.toml, reload without restart:
    #   docker compose kill -s HUP twitch-bot
    #
    # View reload status in logs:
    #   docker compose logs -f twitch-bot | grep -i config
```

## Usage Instructions

### For Docker Users

```bash
# 1. Edit your configuration
nano config/bots.toml

# 2. Reload configuration (bots stay connected)
docker compose kill -s HUP twitch-bot

# 3. Verify reload succeeded
docker compose logs -f twitch-bot | grep "Configuration reloaded"
```

### For Local Development

```bash
# 1. Find the bot process ID
ps aux | grep "bun.*src/index.ts" | grep -v grep

# 2. Send reload signal
kill -HUP <PID>

# 3. Check logs for confirmation
```

### What Happens During Reload

1. **Signal Received**: Process receives SIGHUP signal
2. **Config Loading**: New configuration loaded from `config/bots.toml`
3. **Validation**: Config structure validated
4. **Update or Reject**:
   - Valid: New config applied, bots updated
   - Invalid: Error logged, existing config retained
5. **Bots Stay Connected**: No disconnection/reconnection

## Error Handling

### Invalid Configuration

If the new configuration is invalid:
- Error is logged with details
- Current working configuration is preserved
- Bots continue operating with existing settings
- No service disruption

Example log output:
```
ERROR [ConfigManager] Failed to load config - keeping existing configuration
  err: {
    "message": "Invalid config: missing bots array",
    "stack": "Error: Invalid config..."
  }
```

### File Access Errors

If the config file cannot be read:
- Permission errors logged
- Existing configuration maintained
- Service continues normally

## Testing Procedures

### 1. Basic Reload Test

```bash
# Start the bot
docker compose up -d

# Verify bots are connected
docker compose logs -f twitch-bot

# Edit configuration (e.g., change temperature)
vi config/bots.toml

# Reload
docker compose kill -s HUP twitch-bot

# Verify new settings applied in logs
```

### 2. Error Recovery Test

```bash
# Introduce syntax error in TOML
echo "invalid syntax{" >> config/bots.toml

# Attempt reload
docker compose kill -s HUP twitch-bot

# Verify error logged but bots still running
docker compose logs -f twitch-bot

# Fix syntax error
# Reload again - should succeed
```

### 3. Rapid Reload Test

```bash
# Test multiple rapid reloads
for i in {1..5}; do
  docker compose kill -s HUP twitch-bot
  sleep 2
done

# Verify all reloads processed correctly
```

## Monitoring

### Log Patterns to Monitor

Success:
```
INFO  [Main] 📨 SIGHUP received - reloading configuration...
INFO  [ConfigManager] Loaded 3 bots from config
INFO  [Main] ✅ Configuration reloaded successfully
```

Error:
```
INFO  [Main] 📨 SIGHUP received - reloading configuration...
ERROR [ConfigManager] Failed to load config - keeping existing configuration
ERROR [Main] ❌ Failed to reload configuration
```

## Comparison with Alternatives

### Why Not File Watching?

- Doesn't work reliably in Docker volumes
- CPU overhead from polling
- Can trigger multiple times during file save

### Why Not HTTP Endpoint?

- Adds complexity and attack surface
- Requires port exposure
- SIGHUP is the established pattern

### Why Not PM2?

- Violates Docker's one-process principle
- PM2 watch restarts entire process (not graceful)
- Adds unnecessary overhead

## Security Considerations

1. **Signal Permissions**: Only users with container access can send signals
2. **Config Validation**: All configs validated before applying
3. **No Remote Access**: No network endpoint exposed
4. **Read-Only Mount**: Config volume mounted read-only in Docker

## Future Enhancements

1. **Config Diff Logging**: Log what changed during reload
2. **Metrics**: Track reload frequency and success rate
3. **Config Backup**: Auto-backup before applying changes
4. **Webhook Notification**: Optional Discord/Slack notification on reload

## Rollback Plan

If issues arise with SIGHUP implementation:

1. **Immediate**: Use container restart as before
   ```bash
   docker compose restart twitch-bot
   ```

2. **Code Rollback**: Remove signal handlers and revert ConfigManager changes

3. **Alternative**: Implement simple HTTP endpoint if SIGHUP proves problematic

## References

- [Docker kill documentation](https://docs.docker.com/engine/reference/commandline/kill/)
- [Node.js process signals](https://nodejs.org/api/process.html#process_signal_events)
- [nginx reload pattern](http://nginx.org/en/docs/control.html)
- [HAProxy reload pattern](https://www.haproxy.com/blog/hitless-reloads-with-haproxy-howto/)