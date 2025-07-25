import { BOTS, type BotName } from '@/config/bot.schema';
import { botConfig } from '@/config/bots';
import { AIService } from './ai.service';
import { ChatListenerService, type ChatMessage } from './chat-listener.service';
import { ChatbotService } from './chatbot.service';

export class Bootstrapper {
  private chatListener: ChatListenerService;
  private chatbot: ChatbotService;
  private aiService: AIService;

  constructor() {
    this.chatListener = new ChatListenerService();
    this.chatbot = new ChatbotService(botConfig);
    this.aiService = new AIService();

    this.chatListener.on('message', async (message) => {
      const { shouldRespond, mentions } = this.determineSender(message);

      if (shouldRespond) {
        const moderationResponse =
          await this.aiService.generateModerationResponse({
            botName: 'neckbearddiscordmod',
            triggerMessage: message.message,
            onModAction: (username) => {
              this.chatbot.timeout({
                botName: 'neckbearddiscordmod',
                user: username,
                duration: 60,
                reason: 'Violation of chat rules',
              });
            },
            triggerUser: message.user,
          });

        if (moderationResponse) {
          this.chatbot.say('neckbearddiscordmod', moderationResponse.text);
        }
      }

      if (shouldRespond) {
        const response = await this.aiService.generateResponse({
          botName: mentions[0],
          triggerMessage: message.message,
        });

        if (response) {
          this.chatbot.say(mentions[0], response);
        }
      }
    });
  }

  start(): void {
    this.chatListener.start();
    this.chatbot.start();
  }

  stop(): void {
    this.chatListener.stop();
    this.chatbot.stop();
  }


  determineSender(chatMessage: ChatMessage): {
    shouldRespond: boolean;
    mentions: BotName[];
  } {
    const lowerMessage = chatMessage.message.toLowerCase();

    const mentions = BOTS.filter((botName) =>
      lowerMessage.includes(`@${botName.toLowerCase()}`)
    );

    const shouldRespond = mentions.length > 0 || Math.random() < 0.25;

    return {
      shouldRespond,
      mentions,
    };
  }
}
