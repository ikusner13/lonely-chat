import { ApiClient } from '@twurple/api';
import type { BotName } from '@/config/bot.schema';
import { env } from '@/env';
import type { ChatMessage, Role } from './chat-listener.service';
import { ChatbotService } from './chatbot.service';
import type { TokenManager } from './token.service';

export class ModeratorBotService {
  private readonly chatbot: ChatbotService;
  private readonly apiClient: ApiClient;
  private readonly twitchChannelId = env.TWITCH_CHANNEL_ID;
  private readonly maxTimeoutDuration = 60 * 1000; // 1 minute

  private constructor(chatbot: ChatbotService, apiClient: ApiClient) {
    this.chatbot = chatbot;
    this.apiClient = apiClient;
  }

  static async create(
    tokenManager: TokenManager,
    botName: BotName
  ): Promise<ModeratorBotService> {
    try {
      const chatbot = await ChatbotService.create(tokenManager, botName, [
        'moderation',
      ]);

      const apiClient = new ApiClient({
        authProvider: chatbot.authProvider,
      });

      return new ModeratorBotService(chatbot, apiClient);
    } catch (error) {
      throw new Error(
        `Failed to create ModeratorBotService: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  joinChannel(): void {
    this.chatbot.joinChannel();
  }

  leaveChannel(): void {
    this.chatbot.leaveChannel();
  }

  say(message: string): void {
    this.chatbot.say(message);
  }

  async timeout({
    chatMessage,
    duration,
    reason,
  }: {
    chatMessage: ChatMessage;
    duration: number;
    reason: string;
  }): Promise<void> {
    const userRole = chatMessage.role;

    // don't try to timeout moderators or broadcasters
    if (!this.canTimeoutUser(userRole)) {
      return;
    }

    const user = chatMessage.user;

    await this.apiClient.moderation.banUser(this.twitchChannelId, {
      user,
      reason,
      duration: this.ensureMaxTimeoutDuration(duration),
    });
  }

  canTimeoutUser(role: Role): boolean {
    return role === 'user';
  }

  ensureMaxTimeoutDuration(duration: number): number {
    return Math.min(duration, this.maxTimeoutDuration);
  }

  isSelf(user: string): boolean {
    return user === this.chatbot.botName;
  }
}
