import PQueue from 'p-queue';
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
  // Queue system for handling concurrent messages
  private globalQueue: PQueue; // Controls overall message processing rate
  private botQueues: Map<BotName, PQueue>; // Controls per-bot response rate
  private responseChance = 0.25; // Default 25% chance for non-mention messages

  constructor(
    botManager: BotManager,
    aiService: AIService,
    orchestrator: MultiBotOrchestratorV2
  ) {
    this.botManager = botManager;
    this.aiService = aiService;
    this.orchestrator = orchestrator;

    // Initialize the global queue
    // Concurrency: 5 means max 5 bot responses being processed at once
    this.globalQueue = new PQueue({ concurrency: 5 });

    // Initialize per-bot queues
    this.botQueues = new Map();

    // Create a queue for each bot
    // Concurrency: 2 means each bot can process max 2 responses at once
    const botNames = this.botManager.getBotNames() as BotName[];
    for (const botName of botNames) {
      this.botQueues.set(botName, new PQueue({ concurrency: 2 }));
    }
  }

  handleIncomingMessage(channel: string, user: string, message: string): void {
    console.log(`[${channel}] ${user}: ${message}`);
    
    // Debug: Log when this method is called
    console.log(`🔍 handleIncomingMessage called at ${new Date().toISOString()}`);

    // Create message context
    const botNames = this.botManager.getBotNames() as BotName[];
    console.log(`🤖 Available bot names for mention detection:`, botNames);
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
    
    // Debug: Log how many responses were determined
    console.log(`📊 Orchestrator determined ${responses.length} responses:`, responses);

    // Queue each response immediately (no timer conflicts!)
    for (const response of responses) {
      this.queueResponse(response, context);
    }
  }

  /**
   * Queues a bot response with proper concurrency control
   * The delay is included INSIDE the queued task, not managed separately
   */
  private queueResponse(
    response: ScheduledResponse,
    context: MessageContext
  ): void {
    const botQueue = this.botQueues.get(response.botName);
    if (!botQueue) {
      console.error(`No queue found for bot ${response.botName}`);
      return;
    }

    // Add to global queue first (respects global concurrency limit)
    this.globalQueue.add(() =>
      // Then add to bot-specific queue (respects per-bot limit)
      botQueue.add(async () => {
        try {
          // 🎯 KEY INSIGHT: Delay happens INSIDE the task!
          // This makes the delay part of the bot's "work"
          await this.sleep(response.delay);

          // Now execute the actual response
          await this.executeResponse(response.botName, context);
        } catch (error) {
          console.error(
            `Failed to execute response for ${response.botName}:`,
            error
          );
        }
      })
    );
  }

  /**
   * Simple sleep utility for delays
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
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

    // Set up message handler only on the FIRST bot
    // This bot will listen to all messages and route them appropriately
    if (botNames.length > 0) {
      const listenerBot = botNames[0];
      
      this.botManager.setMessageHandler(
        listenerBot,
        (channel: string, user: string, message: string) => {
          this.handleIncomingMessage(channel, user, message);
        }
      );
      
      console.log(`✅ Message handler set up on bot: ${listenerBot} (listening for all messages)`);
    }
  }

  /**
   * Get current queue metrics for monitoring
   * Useful for debugging and performance monitoring
   */
  getQueueMetrics() {
    return {
      global: {
        size: this.globalQueue.size, // Tasks waiting to start
        pending: this.globalQueue.pending, // Tasks currently running
      },
      bots: Object.fromEntries(
        Array.from(this.botQueues.entries()).map(([name, queue]) => [
          name,
          { size: queue.size, pending: queue.pending },
        ])
      ),
    };
  }

  /**
   * Gracefully stop all processing (for clean shutdown)
   */
  async gracefulStop(): Promise<void> {
    // Stop accepting new tasks
    this.globalQueue.pause();
    for (const q of this.botQueues.values()) {
      q.pause();
    }

    // Wait for all current tasks to complete
    await this.globalQueue.onIdle();
    await Promise.all(
      Array.from(this.botQueues.values()).map((q) => q.onIdle())
    );
  }

  stop(): void {
    // Clear all queues immediately (cancels pending tasks)
    this.globalQueue.clear();
    for (const queue of this.botQueues.values()) {
      queue.clear();
    }
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
