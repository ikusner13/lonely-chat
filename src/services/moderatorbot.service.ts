import { ApiClient } from '@twurple/api';
import { EventEmitter } from 'tseep';
import type { BotName } from '@/config/bot.schema';
import { getBotConfig } from '@/config/bot.schema';
import { env } from '@/env';
import { createLogger } from '@/utils/logger';
import type { AIService } from './ai.service';
import type { ChatMessage, Role } from './chat-listener.service';
import { ChatbotService } from './chatbot.service';
import type { TokenManager } from './token.service';

export class ModeratorBotService extends EventEmitter<{
  moderate: (messages: ChatMessage[]) => void;
}> {
  private readonly chatbot: ChatbotService;
  private readonly apiClient: ApiClient;
  private readonly maxTimeoutDuration = 60 * 1000; // 1 minute

  private readonly queueCheckInterval = 30_000 as const;
  private queueCheckIntervalId: NodeJS.Timeout | undefined = undefined;
  private logger = createLogger('ModeratorBotService');

  private modMessageQueue_: ChatMessage[] = [];
  private botUserId: string;

  private constructor(
    chatbot: ChatbotService,
    apiClient: ApiClient,
    botUserId: string
  ) {
    super();

    this.chatbot = chatbot;
    this.apiClient = apiClient;
    this.botUserId = botUserId;

    this.startQueueCheckInterval();
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

      const tokenData = await tokenManager.getBotToken(botName);

      if (!tokenData) {
        throw new Error(`Token not found for bot ${botName}`);
      }

      const botUserId = tokenData.userId;

      if (!botUserId) {
        throw new Error(`Bot user ID not found for bot ${botName}`);
      }

      return new ModeratorBotService(chatbot, apiClient, botUserId);
    } catch (error) {
      throw new Error(
        `Failed to create ModeratorBotService: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  async joinChannel(): Promise<void> {
    await this.chatbot.joinChannel();
  }

  leaveChannel(): void {
    this.logger.info('👮 Moderator bot leaving channel');
    this.stopQueueCheckInterval();
    this.chatbot.leaveChannel();
  }

  say(message: string): void {
    this.chatbot.say(message);
  }

  async timeout({
    user,
    duration,
    reason,
  }: {
    user: string;
    duration: number;
    reason: string;
  }): Promise<void> {
    this.logger.info({ user, duration, reason }, 'Timing out user');

    const twitchUser = await this.apiClient.users.getUserByName(user);

    if (!twitchUser) {
      throw new Error('User not found');
    }

    try {
      await this.apiClient.asUser(this.botUserId, async (userClient) => {
        const bannedUsers = await userClient.moderation.banUser(
          env.TWITCH_CHANNEL_ID,
          {
            user: twitchUser.id,
            reason,
            duration: this.ensureMaxTimeoutDuration(duration),
          }
        );

        const bannedUser = await bannedUsers[0]?.getUser();

        this.logger.info({ user: bannedUser.displayName }, 'Banned user');
      });
    } catch (error) {
      this.logger.error(
        { err: error, user, duration, reason },
        'Error timing out user'
      );
    }
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

  addToQueue(message: ChatMessage): void {
    this.modMessageQueue_.push(message);
  }

  get modMessageQueue(): ChatMessage[] {
    return this.modMessageQueue;
  }

  stopQueueCheckInterval(): void {
    this.logger.info('👮 Moderator bot moderation queue stopped');
    clearInterval(this.queueCheckIntervalId);
  }

  private startQueueCheckInterval(): void {
    this.queueCheckIntervalId = setInterval(() => {
      this.processQueue();
    }, this.queueCheckInterval);
  }

  private clearQueue(): void {
    this.modMessageQueue_ = [];
  }

  private processQueue(): void {
    const messages = this.modMessageQueue_;

    this.logger.info({ messages }, 'Processing queue');

    if (messages.length === 0) {
      return;
    }

    this.emit('moderate', messages);

    this.clearQueue();
  }

  async setupAndConnect(ai: AIService): Promise<void> {
    await this.joinChannel();

    const botConfig = getBotConfig();
    const moderatorBot = botConfig.neckbearddiscordmod;

    this.say(moderatorBot.introMessage ?? '👋');

    this.on('moderate', async (messages) => {
      const moderationResults = await ai.generateModerationResponse({
        moderatorBotName: 'neckbearddiscordmod',
        messages,
      });

      if (!moderationResults || moderationResults.violations.length === 0) {
        return;
      }

      await Promise.all(
        moderationResults.violations.map((result) => {
          const chatMessage = messages.find((m) => m.user === result.user);

          if (!chatMessage) {
            return Promise.resolve();
          }

          return this.timeout({
            user: result.user,
            duration: result.duration,
            reason: result.reason,
          });
        })
      );
    });
  }

  handleMessage(msg: ChatMessage): void {
    if (this.canTimeoutUser(msg.role)) {
      this.addToQueue(msg);
    }
  }
}
