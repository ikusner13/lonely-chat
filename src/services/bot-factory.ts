import type { BotName } from '@/config/bot.schema';
import { BOTS, getBotConfig } from '@/config/bot.schema';
import { createLogger } from '@/utils/logger';
import { ChatbotService } from './chatbot.service';
import { ModeratorBotService } from './moderatorbot.service';
import type { TokenManager } from './token.service';

const logger = createLogger('BotFactory');

export async function createAllBots(tokenManager: TokenManager): Promise<{
  bots: Map<BotName, ChatbotService>;
  moderatorBot: ModeratorBotService;
}> {
  logger.info('🤖 Creating bots from configuration...');
  const config = getBotConfig();
  const bots = new Map<BotName, ChatbotService>();
  let moderatorBot: ModeratorBotService | undefined;

  await Promise.all(
    BOTS.map(async (botName) => {
      try {
        const botPersonality = config[botName];
        if (botPersonality.isModerator) {
          logger.info(`👮 Creating moderator bot: ${botName}...`);
          moderatorBot = await ModeratorBotService.create(
            tokenManager,
            botName
          );
          logger.info(`✅ Created moderator bot: ${botName}`);
        } else {
          const bot = await ChatbotService.create(tokenManager, botName);
          bots.set(botName, bot);
          logger.info(`✅ Created bot: ${botName}`);
        }
      } catch (error) {
        logger.error({ err: error }, `❌ Failed to create bot: ${botName}`);
        throw error;
      }
    })
  );

  if (!moderatorBot) {
    throw new Error('No moderator bot configured');
  }

  return { bots, moderatorBot };
}
