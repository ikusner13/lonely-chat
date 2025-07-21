import type { BotName } from '@/config/bot.schema';
import type { MultiBotOrchestratorV2 } from '@/multi-bot-orchestrator-v2';
import type { AIService } from './ai.service';
import type { BotManager } from './bot-manager.service';

export interface MessageContext {
  channel: string;
  user: string;
  message: string;
  timestamp: Date;
  mentions: BotName[];
}

export interface ScheduledResponse {
  botName: BotName;
  delay: number;
  priority: 'high' | 'normal' | 'low';
}

export class MessageRouter {
  private botManager: BotManager;
  private aiService: AIService;
  private orchestrator: MultiBotOrchestratorV2;
  private responseTimers: Map<string, NodeJS.Timeout> = new Map();
  private responseChance = 0.25; // Default 25% chance for non-mention messages

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
    console.log(`[${channel}] ${user}: ${message}`);

    // Create message context
    const botNames = this.botManager.getBotNames() as BotName[];
    const analysis = this.analyzeMessageTriggers(message, botNames);

    const context: MessageContext = {
      channel,
      user,
      message,
      timestamp: new Date(),
      mentions: analysis.mentions,
    };

    // Get response decisions from orchestrator
    const responses = this.orchestrator.determineResponses(
      analysis.mentions,
      analysis.shouldRespond
    );

    // Schedule responses
    this.scheduleResponses(responses, context);
  }

  private scheduleResponses(
    responses: ScheduledResponse[],
    context: MessageContext
  ): void {
    // Clear any existing timers for safety
    this.clearResponseTimers();

    responses.forEach((response, _index) => {
      const timerId = `${response.botName}-${Date.now()}`;
      const timer = setTimeout(() => {
        this.executeResponse(response.botName, context);
        this.responseTimers.delete(timerId);
      }, response.delay);

      this.responseTimers.set(timerId, timer);
    });
  }

  private async executeResponse(
    botName: BotName,
    context: MessageContext
  ): Promise<void> {
    const bot = this.botManager.getBot(botName);

    if (!bot) {
      console.error(`Bot ${botName} not found`);
      return;
    }

    try {
      // Generate AI response
      const response = await this.aiService.generateResponse({
        channelName: context.channel,
        botName,
        triggerMessage: context.message,
        triggerUser: context.user,
      });

      if (response) {
        // Send the message
        await bot.client.sendMessage(context.channel, response);

        // Update bot state
        this.botManager.updateBotState(botName);

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

  private analyzeMessageTriggers(
    message: string,
    botNames: BotName[]
  ): {
    shouldRespond: boolean;
    mentions: BotName[];
  } {
    const lowerMessage = message.toLowerCase();

    // Check for mentions
    const mentions = botNames.filter((botName) =>
      lowerMessage.includes(`@${botName.toLowerCase()}`)
    );

    // Determine if bots should respond
    const shouldRespond =
      mentions.length > 0 || Math.random() < this.responseChance;

    console.log('shouldRespond', shouldRespond);

    return {
      shouldRespond,
      mentions,
    };
  }
}
