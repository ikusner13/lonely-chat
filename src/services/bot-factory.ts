import { createLogger } from '@/utils/logger';
import { ChatbotService } from './chatbot.service';
import type { ConfigManager } from './config-manager';
import { ModeratorBotService } from './moderatorbot.service';
import type { TokenManager } from './token.service';

const logger = createLogger('BotFactory');

export async function createAllBots(
  tokenManager: TokenManager,
  configManager: ConfigManager
): Promise<{
  bots: Map<string, ChatbotService>;
  moderatorBot: ModeratorBotService;
}> {
  logger.info('🤖 Creating bots from configuration...');
  const botConfigs = configManager.getBots();
  const bots = new Map<string, ChatbotService>();
  let moderatorBot: ModeratorBotService | undefined;

  await Promise.all(
    botConfigs.map(async (botConfig) => {
      try {
        if (botConfig.role === 'moderator') {
          logger.info(`👮 Creating moderator bot: ${botConfig.name}...`);
          moderatorBot = await ModeratorBotService.create(
            tokenManager,
            botConfig.name,
            botConfig
          );
          logger.info(`✅ Created moderator bot: ${botConfig.name}`);
        } else {
          const bot = await ChatbotService.create(
            tokenManager,
            botConfig.name,
            botConfig
          );
          bots.set(botConfig.name, bot);
          logger.info(`✅ Created bot: ${botConfig.name}`);
        }
      } catch (error) {
        logger.error(
          { err: error },
          `❌ Failed to create bot: ${botConfig.name}`
        );
        throw error;
      }
    })
  );

  if (!moderatorBot) {
    throw new Error('No moderator bot configured');
  }

  return { bots, moderatorBot };
}
