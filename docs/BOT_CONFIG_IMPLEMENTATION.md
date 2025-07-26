# Bot Configuration System Implementation Plan

## Overview
Migrate from hardcoded bot configuration to external TOML configuration with hot reloading support.

## Benefits
- No rebuild/redeploy needed to add or modify bots
- Hot reload configuration changes
- Cleaner multi-line system prompts
- Separation of config from code
- Easy bot management

## Architecture

```
┌─────────────────────────┐
│   config/bots.toml      │ ← External config file
└───────────┬─────────────┘
            │ File watch
            ▼
┌─────────────────────────┐
│  CachedBotManager       │ ← Caches config in memory
├─────────────────────────┤
│ - getRandomChatter()    │
│ - getModerator()        │
│ - getAllBots()          │
└───────────┬─────────────┘
            │ Used by
            ▼
┌─────────────────────────┐
│    App Services         │
├─────────────────────────┤
│ - ChatbotService        │
│ - ModeratorBotService   │
│ - AIService             │
└─────────────────────────┘
```

## Implementation Steps

### Step 1: Create the Bot Manager (15 min)

1. Create `src/config/bot-manager.ts`:

```typescript
import { watch } from 'node:fs';

export interface Bot {
  name: string; // Twitch account name (e.g., "stickyman1776")
  role: 'chatter' | 'moderator';
  model: string;
  systemPrompt: string;
  temperature?: number;
  maxTokens?: number;
  fallbackModels?: string[];
  description?: string;
}

interface BotConfig {
  bots: Bot[];
}

export class BotManager {
  private static instance: BotManager;
  private configPath: string;
  private config: BotConfig | null = null;
  private watcher: any;

  private constructor(configPath: string) {
    this.configPath = configPath;
  }

  static getInstance(configPath?: string): BotManager {
    if (!BotManager.instance) {
      BotManager.instance = new BotManager(
        configPath || process.env.BOT_CONFIG_PATH || './config/bots.toml'
      );
    }
    return BotManager.instance;
  }

  async initialize(): Promise<void> {
    await this.loadConfig();
    
    this.watcher = watch(this.configPath, async (eventType) => {
      if (eventType === 'change') {
        console.log('[BotManager] Config changed, reloading...');
        await this.loadConfig();
      }
    });
  }

  destroy(): void {
    if (this.watcher) {
      this.watcher.close();
    }
  }

  getRandomChatter(): Bot | null {
    if (!this.config) return null;
    const chatters = this.config.bots.filter(bot => bot.role === 'chatter');
    if (chatters.length === 0) return null;
    return chatters[Math.floor(Math.random() * chatters.length)];
  }

  getModerator(): Bot | null {
    if (!this.config) return null;
    return this.config.bots.find(bot => bot.role === 'moderator') || null;
  }

  getAllChatters(): Bot[] {
    if (!this.config) return [];
    return this.config.bots.filter(bot => bot.role === 'chatter');
  }

  getAllBots(): Bot[] {
    if (!this.config) return [];
    return this.config.bots;
  }


  private async loadConfig(): Promise<void> {
    try {
      const file = Bun.file(this.configPath);
      const exists = await file.exists();
      
      if (!exists) {
        console.error(`[BotManager] Config file not found: ${this.configPath}`);
        return;
      }

      // Bun can import TOML directly!
      const config = await import(this.configPath) as BotConfig;

      if (!config.bots || !Array.isArray(config.bots)) {
        throw new Error('Invalid config: missing bots array');
      }

      this.config = config;
      console.log(`[BotManager] Loaded ${config.bots.length} bots`);
    } catch (error) {
      console.error('[BotManager] Failed to load config:', error);
    }
  }
}
```

2. No dependencies needed - Bun supports TOML natively!

### Step 2: Create TOML Config File (10 min)

1. Create `config/bots.toml`:

```toml
# Twitch Bot Configuration
# To add a new bot: copy a [[bots]] section and modify

[[bots]]
name = "stickyman1776"
role = "chatter"
model = "deepseek/deepseek-chat-v3-0324:free"
temperature = 1.1
maxTokens = 100
description = "Enthusiastic hype bot"
fallbackModels = ["mistralai/mistral-nemo:free", "moonshotai/kimi-k2:free"]

systemPrompt = """
You are an enthusiastic Twitch chat bot in the streamer's channel.
You're the ultimate hype person - a supportive cheerleader who brings positive energy to every interaction.
Keep responses under 100 characters to fit chat flow naturally.

Core Personality:
- Genuinely excited about everything, sees the best in every situation
- Celebrates both big and small wins, and makes everyone feel valued
- You're like that friend who's always in your corner, cheering you on

Communication Style:
- Use 2-3 Twitch emotes per message (PogChamp, HYPERS, EZ Clap, KEKW, LUL, Pog)
- Mix uppercase for excitement but don't overdo it
- Use exclamation points and positive language

Important restrictions:
- DO NOT include your name or any [name]: prefix in your messages
- DO NOT continue or respond as other bots
- Just write your direct response
- When someone mentions you (@stickyman1776), respond TO THEM by name, not to yourself
"""

[[bots]]
name = "geneJacqueman"
role = "chatter"
model = "deepseek/deepseek-chat-v3-0324:free"
temperature = 1.0
maxTokens = 100
description = "French flirtatious personality"
fallbackModels = ["mistralai/mistral-nemo:free", "moonshotai/kimi-k2:free"]

systemPrompt = """
You are a womanizing frenchman Twitch chat bot in the streamer's twitch chat.
You should be flirty and charming, concise, and to the point.
You take no bullshit from other chatters.
Keep responses under 100 characters to fit chat flow naturally.

Core Personality:
- Flirtatious, charming, and womanizing
- Always trying to rizz
- Would be the guy at the bar trying to get the girl

Communication Style:
- Speak in english 95% of the time but mix in SOME french words and phrases
- USE MINIMAL FRENCH, ONLY FOR EFFECT
- Talk about women
- You are concise, rude, but flirtatious and to the point

Rules:
- DO NOT RESPOND WITH ACTIONS LIKE *ACTION*
- DO NOT TALK IN QUOTES
- DO NOT SAY YOUR NAME IN THE CHAT MESSAGE
- USE NO EMOJIS
- When someone mentions you (@geneJacqueman), respond TO THEM by name
"""

[[bots]]
name = "jessiepinkmanbreakingbad"
role = "chatter"
model = "deepseek/deepseek-chat-v3-0324:free"
temperature = 0.9
maxTokens = 100
description = "Jesse Pinkman character"

systemPrompt = """
You are Jesse Pinkman from Breaking Bad.
You are to only respond to the user as the character Jesse Pinkman from Breaking Bad.
Make sure to talk in Jesse Pinkman's voice.
End most messages with Jesse Pinkman saying "Yeah, bitch!"
In the correct context, mention characters from Breaking Bad in your responses.
Be very upfront with your involvement in crime and meth making.
NO ACTION TAGGING
Keep your responses concise
"""

[[bots]]
name = "neckbearddiscordmod"
role = "moderator"
model = "deepseek/deepseek-chat-v3-0324:free"
temperature = 0.7
maxTokens = 100
description = "Nerdy moderator bot"

systemPrompt = """
You are a moderator in this twitch chat.
You are nerdy Twitch chat moderator. Your personality is being a dweeb. 
You give off teacher's pet, kindergarten cop, mall cop type vibes. 
Be concise, but have personality.
"""
```

2. Add to `.gitignore`:
```
config/bots.toml
```

3. Create example config:
```bash
cp config/bots.toml config/bots.toml.example
```

### Step 3: Update App.ts (20 min)

1. Update `src/app.ts` to initialize BotManager:

```typescript
import { BotManager } from './config/bot-manager';

export class App {
  private botManager: BotManager;
  // ... other properties

  constructor() {
    this.botManager = BotManager.getInstance();
    // ... existing code
  }

  async start() {
    this.logger.info('🚀 Starting app...');

    // Initialize bot manager first
    await this.botManager.initialize();

    // ... rest of start logic
  }

  async stop() {
    this.logger.info('🛑 Stopping app...');
    
    // Clean up bot manager
    this.botManager.destroy();

    // ... rest of stop logic
  }

  // Update createBotServices to use BotManager
  private createBotServices() {
    const chatters = this.botManager.getAllChatters();
    
    this.chatbotServices = chatters.map((bot) => {
      return new ChatbotService(
        bot.name, // Use the Twitch account name
        {
          model: bot.model,
          systemPrompt: bot.systemPrompt,
          temperature: bot.temperature || 0.7,
          maxTokens: bot.maxTokens || 100,
          fallbackModels: bot.fallbackModels,
        },
        this.tokenService,
        this.chatbotQueue,
        this.aiService
      );
    });

    // Create moderator service
    const moderatorBot = this.botManager.getModerator();
    if (moderatorBot) {
      this.moderatorService = new ModeratorBotService(
        moderatorBot.name, // Use the Twitch account name
        {
          model: moderatorBot.model,
          systemPrompt: moderatorBot.systemPrompt,
          temperature: moderatorBot.temperature || 0.7,
          maxTokens: moderatorBot.maxTokens || 100,
        },
        this.tokenService,
        this.aiService
      );
    }
  }
}
```

### Step 4: Local Development Setup (5 min)

1. Create local config:
```bash
mkdir -p config
cp config/bots.toml.example config/bots.toml
```

2. Update `.env`:
```bash
# Optional: Override config path
BOT_CONFIG_PATH=./config/bots.toml
```

3. Run locally:
```bash
bun run dev
```

4. Test hot reload:
- Edit `config/bots.toml` while app is running
- Save the file
- Check console for "[BotManager] Config changed, reloading..."
- Verify new bot behavior in chat

### Step 5: Docker Setup (10 min)

1. No Dockerfile changes needed - the current multi-stage build is perfect!

2. Update `docker-compose.yml` to add config volume:
```yaml
services:
  twitch-bot:
    build: .
    environment:
      - TWITCH_CLIENT_ID=${TWITCH_CLIENT_ID}
      - TWITCH_CLIENT_SECRET=${TWITCH_CLIENT_SECRET}
      - TWITCH_CHANNEL_ID=${TWITCH_CHANNEL_ID}
      - TWITCH_CHANNEL_NAME=${TWITCH_CHANNEL_NAME}
      - OPENROUTER_KEY=${OPENROUTER_KEY}
      - TOKEN_DB_PATH=/data/tokens.db
      - BOT_CONFIG_PATH=/config/bots.toml  # Add this
    volumes:
      - bot-data:/data
      - ./config:/config:ro  # Add this - mount config as read-only
    restart: unless-stopped
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"

volumes:
  bot-data:
    driver: local
```

3. Deploy:
```bash
# Build and run
docker-compose up --build -d

# Check logs
docker-compose logs -f

# Update bots without restart
vim config/bots.toml  # Edit on host machine
# Save file - container detects change and auto-reloads!
```

### Step 6: Migration Checklist (10 min)

1. **Before deploying:**
   - [ ] Create `config/bots.toml` with all current bots
   - [ ] Test locally with `bun run dev`
   - [ ] Verify all bots load correctly
   - [ ] Test hot reload by editing config

2. **Deploy steps:**
   - [ ] Copy `config/bots.toml` to production server
   - [ ] Update Docker image with new code
   - [ ] Mount config volume in docker-compose
   - [ ] Start container and verify bots work

3. **After deployment:**
   - [ ] Remove old bot config files
   - [ ] Update documentation

### Step 7: Cleanup Old System

Remove old config files:
- `src/config/bots.ts`
- `src/config/bot.schema.ts`
- `src/config/MIGRATION.md`

## Troubleshooting

**Config not loading:**
- Check file path in logs
- Verify TOML syntax (use online validator)
- Check file permissions in Docker

**Hot reload not working:**
- File watching may not work in some Docker environments
- Can manually restart container as fallback

**Bots not appearing:**
- Check `role` field is exactly "chatter" or "moderator"
- Verify TOML array syntax `[[bots]]`
- Check console for parsing errors

## Benefits Achieved

✅ No rebuild needed for bot changes
✅ Hot reload in development and production  
✅ Clean multi-line system prompts
✅ Easy to add/remove bots
✅ Config separate from code
✅ Can update bots without any downtime