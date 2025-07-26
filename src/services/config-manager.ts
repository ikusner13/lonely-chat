import { watch } from 'node:fs';
import { EventEmitter } from 'tseep';
import { createLogger } from '@/utils/logger';

export interface BotConfig {
  name: string;
  role: 'chatter' | 'moderator';
  model: string;
  systemPrompt: string;
  temperature?: number;
  maxTokens?: number;
  fallbackModels?: string[];
  introMessage?: string;
}

interface ConfigFile {
  bots: BotConfig[];
}

export class ConfigManager extends EventEmitter<{
  'config:updated': () => void;
  'config:error': (error: Error) => void;
}> {
  private config: ConfigFile | null = null;
  private configPath: string;
  private watcher: ReturnType<typeof watch> | undefined;
  private logger = createLogger('ConfigManager');

  constructor(configPath?: string) {
    super();
    this.configPath =
      configPath || process.env.BOT_CONFIG_PATH || './config/bots.toml';
  }

  async initialize(): Promise<void> {
    await this.loadConfig();
    this.setupWatcher();
  }

  public async loadConfig(): Promise<void> {
    try {
      // Convert relative path to absolute for import
      const absolutePath = this.configPath.startsWith('/')
        ? this.configPath
        : `${process.cwd()}/${this.configPath}`;

      // Force re-import by adding timestamp query parameter
      const timestampedPath = `${absolutePath}?t=${Date.now()}`;
      
      // Clear any existing module cache
      try {
        const resolvedPath = require.resolve(absolutePath);
        delete require.cache[resolvedPath];
      } catch {
        // Module might not be in cache yet, that's fine
      }

      // Bun can import TOML directly!
      const imported = await import(timestampedPath);
      // TOML imports have the data as named exports
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

  private setupWatcher(): void {
    this.watcher = watch(this.configPath, async (eventType) => {
      if (eventType === 'change') {
        this.logger.info('Config changed, reloading...');
        await this.loadConfig();
        // Just emit that config updated - let consumers figure out what to do
        this.emit('config:updated');
      }
    });
  }

  destroy(): void {
    if (this.watcher) {
      this.watcher.close();
    }
  }

  // Simple getters - consumers can call these after update event
  getBots(): BotConfig[] {
    return this.config?.bots || [];
  }

  getBot(name: string): BotConfig | undefined {
    return this.getBots().find((bot) => bot.name === name);
  }

  getModerator(): BotConfig | null {
    return this.getBots().find((bot) => bot.role === 'moderator') || null;
  }

  getChatters(): BotConfig[] {
    return this.getBots().filter((bot) => bot.role === 'chatter');
  }
}
