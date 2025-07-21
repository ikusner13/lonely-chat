import type { BotName } from '@/config/bot.schema';
import type { MultiBotOrchestratorV2 } from '@/multi-bot-orchestrator-v2';
import type { AIService } from './ai.service';
import type { BotManager } from './bot-manager.service';

export interface MessageContext {
  channel: string;
  user: string;
  message: string;
  timestamp: Date;
  mentionedBots: BotName[];
}

export interface BotResponse {
  botName: BotName;
  delay: number;
  priority: 'high' | 'normal' | 'low';
}

interface ConversationState {
  isActive: boolean;
  lastMessageTime: Date;
  messagesSinceLastBotResponse: number;
  currentSpeaker?: string;
}

export class MessageRouter {
  private botManager: BotManager;
  private aiService: AIService;
  private orchestrator: MultiBotOrchestratorV2;
  private responseTimers: Map<string, NodeJS.Timeout> = new Map();
  private conversationState: ConversationState = {
    isActive: false,
    lastMessageTime: new Date(),
    messagesSinceLastBotResponse: 0,
  };

  constructor(
    botManager: BotManager,
    aiService: AIService,
    orchestrator: MultiBotOrchestratorV2
  ) {
    this.botManager = botManager;
    this.aiService = aiService;
    this.orchestrator = orchestrator;
  }

  handleIncomingMessage(channel: string, user: string, message: string): void {
    // Don't process messages from bots themselves
    if (this.botManager.isBotUsername(user)) {
      return;
    }

    console.log(`[${channel}] ${user}: ${message}`);

    // Update conversation state
    this.conversationState.lastMessageTime = new Date();
    this.conversationState.messagesSinceLastBotResponse++;

    // Create message context
    const botNames = this.botManager.getBotNames() as BotName[];
    const analysis = this.aiService.analyzeMessageTriggers(message, botNames);

    const context: MessageContext = {
      channel,
      user,
      message,
      timestamp: new Date(),
      mentionedBots: analysis.mentionedBots,
    };

    // Get response decisions from orchestrator
    const responses = this.orchestrator.determineResponses(context);

    // Schedule bot responses
    this.scheduleBotResponses(responses, context);
  }

  private scheduleBotResponses(
    responses: BotResponse[],
    context: MessageContext
  ): void {
    // Clear any existing timers for safety
    this.clearResponseTimers();

    responses.forEach((response, _index) => {
      const timerId = `${response.botName}-${Date.now()}`;
      const timer = setTimeout(() => {
        this.executeBotResponse(response.botName, context);
        this.responseTimers.delete(timerId);
      }, response.delay);

      this.responseTimers.set(timerId, timer);
    });
  }

  private async executeBotResponse(
    botName: BotName,
    context: MessageContext
  ): Promise<void> {
    const bot = this.botManager.getBot(botName);

    if (!bot) {
      console.error(`Bot ${botName} not found`);
      return;
    }

    try {
      // Get list of other bots for context
      const otherBots = this.botManager
        .getBotNames()
        .filter((name) => name !== botName) as BotName[];

      // Generate AI response
      const response = await this.aiService.generateResponse({
        channelName: context.channel,
        botName,
        triggerMessage: context.message,
        triggerUser: context.user,
        otherBots,
      });

      if (response) {
        // Send the message
        await bot.client.sendMessage(context.channel, response);

        // Update bot state
        this.botManager.updateBotState(botName);
        this.conversationState.messagesSinceLastBotResponse = 0;
        this.conversationState.currentSpeaker = botName;

        console.log(`🤖 ${botName}: ${response}`);
      }
    } catch (error) {
      console.error(`❌ Error generating response for ${botName}:`, error);
    }
  }

  setupMessageHandlers(_channelName: string): void {
    const botNames = this.botManager.getBotNames();

    for (const botName of botNames) {
      this.botManager.setMessageHandler(
        botName,
        (channel: string, user: string, message: string) => {
          this.handleIncomingMessage(channel, user, message);
        }
      );
    }
  }

  private clearResponseTimers(): void {
    for (const timer of this.responseTimers.values()) {
      clearTimeout(timer);
    }
    this.responseTimers.clear();
  }

  stop(): void {
    this.clearResponseTimers();
  }
}
