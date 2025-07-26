import type { BotName } from '@/config/bot.schema';
import { createLogger } from '@/utils/logger';
import type { AIService } from './ai.service';
import type { ChatMessage } from './chat-listener.service';
import type { ChatMessageWindow } from './chat-message-window';
import type { ChatbotService } from './chatbot.service';
import type { ChatbotQueue } from './chatbot-queue';

export class BotResponseCoordinator {
  private logger = createLogger('BotResponseCoordinator');
  private readonly RANDOM_RESPONSE_CHANCE = 0.25;

  private ai: AIService;
  private queue: ChatbotQueue;
  private messageWindow: ChatMessageWindow;
  private bots: Map<BotName, ChatbotService>;

  constructor(
    ai: AIService,
    queue: ChatbotQueue,
    messageWindow: ChatMessageWindow,
    bots: Map<BotName, ChatbotService>
  ) {
    this.ai = ai;
    this.queue = queue;
    this.messageWindow = messageWindow;
    this.bots = bots;
  }

  stop(): void {
    this.queue.stop();
  }

  handleIncomingMessage(msg: ChatMessage) {
    this.logger.debug({ chatMessage: msg }, 'Processing message');
    this.messageWindow.addMessage(msg);

    const botsToRespond = this.determineRespondingBots(msg);
    this.queueBotResponses(botsToRespond, msg);
  }

  private determineRespondingBots(msg: ChatMessage): BotName[] {
    const botsToRespond: BotName[] = [];

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

  private isBotOwnMessage(msg: ChatMessage, botName: BotName): boolean {
    return msg.user.toLowerCase() === botName.toLowerCase();
  }

  private isBotMentioned(msg: ChatMessage, botName: BotName): boolean {
    return msg.message.toLowerCase().includes(`@${botName.toLowerCase()}`);
  }

  private shouldBotRandomlyRespond(botsAlreadyResponding: BotName[]): boolean {
    return (
      botsAlreadyResponding.length === 0 &&
      Math.random() < this.RANDOM_RESPONSE_CHANCE
    );
  }

  private queueBotResponses(botsToRespond: BotName[], msg: ChatMessage): void {
    for (const botName of botsToRespond) {
      const bot = this.bots.get(botName);

      if (!bot) {
        this.logger.error(`Bot ${botName} not found`);
        continue;
      }

      this.queue.addMessage(botName, async () => {
        try {
          const response = await this.ai.generateResponse({
            botName,
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
