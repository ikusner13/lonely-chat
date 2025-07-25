import { RefreshingAuthProvider } from '@twurple/auth';
import { ChatClient } from '@twurple/chat';
import type { BotName } from '@/config/bot.schema';
import { env } from '@/env';
import type { TokenManager } from './token.service';

export class ChatbotService {
  private readonly bot: ChatClient;
  private readonly authProvider_: RefreshingAuthProvider;
  private readonly twitchChannel = env.TWITCH_CHANNEL_NAME;
  private readonly botName_: BotName;

  private constructor(
    authProvider: RefreshingAuthProvider,
    bot: ChatClient,
    botName: BotName
  ) {
    this.authProvider_ = authProvider;
    this.bot = bot;
    this.botName_ = botName;
  }

  static async create(
    tokenManager: TokenManager,
    botName: BotName,
    additionalIntents: string[] = []
  ): Promise<ChatbotService> {
    try {
      const token = await tokenManager.getBotToken(botName);

      if (!token) {
        throw new Error(`Token not found for bot ${botName}`);
      }

      const authProvider = new RefreshingAuthProvider({
        clientId: env.TWITCH_CLIENT_ID,
        clientSecret: env.TWITCH_CLIENT_SECRET,
      });

      authProvider.addUserForToken(
        {
          accessToken: token.accessToken,
          refreshToken: token.refreshToken,
          expiresIn: 0,
          obtainmentTimestamp: Date.now(),
          scope: token.scope,
        },
        ['chat', ...additionalIntents]
      );

      const bot = new ChatClient({
        authProvider,
        channels: [],
      });

      return new ChatbotService(authProvider, bot, botName);
    } catch (error) {
      throw new Error(
        `Failed to create ChatbotService: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  get authProvider(): RefreshingAuthProvider {
    return this.authProvider_;
  }

  get botName(): BotName {
    return this.botName_;
  }

  say(message: string): void {
    this.bot.say(this.twitchChannel, message);
  }

  joinChannel(): void {
    this.bot.connect();
  }

  leaveChannel(): void {
    this.bot.quit();
  }
}
