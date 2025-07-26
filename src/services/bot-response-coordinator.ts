import { createLogger } from '@/utils/logger';
import type { AIService } from './ai.service';
import type { ChatMessage } from './chat-listener.service';
import type { ChatMessageWindow } from './chat-message-window';
import type { ChatbotService } from './chatbot.service';
import type { ChatbotQueue } from './chatbot-queue';
import type { ConfigManager } from './config-manager';

export class BotResponseCoordinator {
  private logger = createLogger('BotResponseCoordinator');
  private readonly RANDOM_RESPONSE_CHANCE = 0.25;
  private ai: AIService;
  private queue: ChatbotQueue;
  private messageWindow: ChatMessageWindow;
  private bots: Map<string, ChatbotService>;
  private configManager: ConfigManager;

  constructor(
    ai: AIService,
    queue: ChatbotQueue,
    messageWindow: ChatMessageWindow,
    bots: Map<string, ChatbotService>,
    configManager: ConfigManager
  ) {
    this.ai = ai;
    this.queue = queue;
    this.messageWindow = messageWindow;
    this.bots = bots;
    this.configManager = configManager;
  }

  stop(): void {
    this.queue.stop();
  }

  refreshBotConfigs(configManager: ConfigManager): void {
    this.configManager = configManager;
    this.logger.info('Bot configs refreshed');
  }

  handleIncomingMessage(msg: ChatMessage) {
    this.logger.debug({ chatMessage: msg }, 'Processing message');
    this.messageWindow.addMessage(msg);

    const botsToRespond = this.determineRespondingBots(msg);
    this.queueBotResponses(botsToRespond, msg);
  }

  private determineRespondingBots(msg: ChatMessage): string[] {
    const botsToRespond: string[] = [];

    for (const [botName] of this.bots) {
      if (this.isBotOwnMessage(msg, botName)) {
        continue;
      }

      if (this.isBotMentioned(msg, botName)) {
        botsToRespond.push(botName);
      } else if (this.shouldBotRandomlyRespond(botsToRespond)) {
        botsToRespond.push(botName);
      }
    }

    return botsToRespond;
  }

  private isBotOwnMessage(msg: ChatMessage, botName: string): boolean {
    return msg.user.toLowerCase() === botName.toLowerCase();
  }

  private isBotMentioned(msg: ChatMessage, botName: string): boolean {
    return msg.message.toLowerCase().includes(`@${botName.toLowerCase()}`);
  }

  private shouldBotRandomlyRespond(botsAlreadyResponding: string[]): boolean {
    return (
      botsAlreadyResponding.length === 0 &&
      Math.random() < this.RANDOM_RESPONSE_CHANCE
    );
  }

  private queueBotResponses(botsToRespond: string[], msg: ChatMessage): void {
    for (const botName of botsToRespond) {
      const bot = this.bots.get(botName);

      if (!bot) {
        this.logger.error(`Bot ${botName} not found`);
        continue;
      }

      const botConfig = this.configManager.getBot(botName);
      if (!botConfig) {
        this.logger.error(`Bot config not found for ${botName}`);
        continue;
      }

      this.queue.addMessage(botName, async () => {
        try {
          const response = await this.ai.generateResponse({
            botName,
            botConfig,
            triggerMessage: `${msg.user}: ${msg.message}`,
            context: this.messageWindow.messages,
          });
          this.logger.debug({ response }, 'Generated response');
          if (response) {
            bot.say(response);
          }
        } catch (error) {
          this.logger.error(
            { err: error },
            `Error generating response for ${botName}`
          );
        }
      });
    }
  }
}
