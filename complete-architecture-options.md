# Complete Architecture Options (All Services Included)

## Option 1: Simple Coordinator Pattern

```typescript
// src/app.ts - Single coordinator that wires everything
export class App {
  private chatListener: ChatListenerService;
  private messageWindow: ChatMessageWindow;
  private bots: Map<BotName, ChatbotService> = new Map();
  private moderatorBot: ModeratorBotService;
  private queue: ChatbotQueue;
  private ai: AIService;
  private stream: StreamService;

  async start() {
    // Initialize core services
    const tokenManager = new TokenManager();
    this.ai = new AIService();
    this.messageWindow = new ChatMessageWindow();
    this.queue = new ChatbotQueue();
    
    // Create write-only bots (but don't connect yet)
    this.bots.set('friendly', await ChatbotService.create(tokenManager, 'friendly'));
    this.bots.set('sassy', await ChatbotService.create(tokenManager, 'sassy'));
    
    // Create moderator bot (but don't connect yet)
    this.moderatorBot = await ModeratorBotService.create(tokenManager, 'moderator');
    
    // Create chat listener (but don't start yet)
    this.chatListener = new ChatListenerService();
    
    // Stream lifecycle - this is what controls everything
    this.stream = await StreamService.create({
      tokenManager,
      onStreamOnline: () => this.connectAll(),
      onStreamOffline: () => this.disconnectAll()
    });
    
    // Check if stream is already online
    const isOnline = await this.stream.isStreamOnline();
    if (isOnline) {
      console.log('Stream is already online, connecting bots...');
      await this.connectAll();
    }
    
    // Start monitoring for future stream status changes
    await this.stream.start();
  }

  private async handleIncomingMessage(msg: ChatMessage) {
    // Add to context window
    this.messageWindow.addMessage(msg);
    
    // Check moderation first
    if (await this.shouldModerate(msg)) {
      this.queue.addMessage('moderator', async () => {
        await this.moderatorBot.timeout(msg.user, 60);
        this.moderatorBot.say(`${msg.user} has been timed out for inappropriate behavior`);
      });
      return;
    }
    
    // Determine which bots should respond
    for (const [botName, bot] of this.bots) {
      if (this.shouldBotRespond(botName, msg)) {
        // Queue AI generation + response
        this.queue.addMessage(botName, async () => {
          const response = await this.ai.generateResponse({
            botName,
            triggerMessage: msg.message,
            context: this.messageWindow.messages
          });
          if (response) {
            bot.say(response);
          }
        });
      }
    }
  }

  private shouldBotRespond(botName: string, msg: ChatMessage): boolean {
    return msg.message.includes(`@${botName}`) || Math.random() < 0.25;
  }

  private async connectAll() {
    // Wire up message handler
    this.chatListener.on('message', (msg) => this.handleIncomingMessage(msg));
    
    // Start listening to chat
    this.chatListener.start();
    
    // Connect all bots
    this.moderatorBot.joinChannel();
    for (const bot of this.bots.values()) {
      bot.joinChannel();
    }
  }

  private async disconnectAll() {
    // Stop listening to chat
    this.chatListener.stop();
    
    // Disconnect all bots
    this.moderatorBot.leaveChannel();
    for (const bot of this.bots.values()) {
      bot.leaveChannel();
    }
    
    // Clear any pending messages
    this.queue.stop();
  }
}
```

## Option 2: Message Pipeline Pattern

```typescript
// src/message-pipeline.ts
export class MessagePipeline {
  constructor(
    private services: {
      listener: ChatListenerService;
      window: ChatMessageWindow;
      ai: AIService;
      queue: ChatbotQueue;
      bots: Map<BotName, ChatbotService>;
      moderator: ModeratorBotService;
    }
  ) {}

  start() {
    this.services.listener.on('message', (msg) => 
      this.process(msg)
        .catch(err => console.error('Pipeline error:', err))
    );
  }

  private async process(msg: ChatMessage) {
    // Step 1: Update context
    this.services.window.addMessage(msg);
    
    // Step 2: Moderation check
    const modAction = await this.checkModeration(msg);
    if (modAction) {
      return this.services.queue.addMessage('moderator', modAction);
    }
    
    // Step 3: Bot response routing
    const responses = await this.generateBotResponses(msg);
    
    // Step 4: Queue responses
    for (const { botName, action } of responses) {
      this.services.queue.addMessage(botName, action);
    }
  }

  private async generateBotResponses(msg: ChatMessage) {
    const responses = [];
    
    for (const [botName, bot] of this.services.bots) {
      if (this.shouldRespond(botName, msg)) {
        responses.push({
          botName,
          action: async () => {
            const response = await this.services.ai.generateResponse({
              botName,
              triggerMessage: msg.message,
              context: this.services.window.messages
            });
            if (response) bot.say(response);
          }
        });
      }
    }
    
    return responses;
  }
}

// src/index.ts
async function main() {
  const tokenManager = new TokenManager();
  
  // Create all services
  const services = {
    listener: new ChatListenerService(),
    window: new ChatMessageWindow(),
    ai: new AIService(),
    queue: new ChatbotQueue(),
    bots: new Map([
      ['friendly', await ChatbotService.create(tokenManager, 'friendly')],
      ['sassy', await ChatbotService.create(tokenManager, 'sassy')]
    ]),
    moderator: await ModeratorBotService.create(tokenManager, 'moderator')
  };
  
  // Create pipeline
  const pipeline = new MessagePipeline(services);
  
  // Stream lifecycle
  const stream = await StreamService.create({
    tokenManager,
    onStreamOnline: () => {
      services.listener.start();
      services.moderator.joinChannel();
      for (const bot of services.bots.values()) {
        bot.joinChannel();
      }
      pipeline.start();
    },
    onStreamOffline: () => {
      services.listener.stop();
      services.moderator.leaveChannel();
      for (const bot of services.bots.values()) {
        bot.leaveChannel();
      }
      services.queue.stop();
    }
  });
}
```

## Option 3: Service Manager Pattern

```typescript
// src/service-manager.ts
export class ServiceManager {
  private services: {
    tokens: TokenManager;
    chatListener: ChatListenerService;
    messageWindow: ChatMessageWindow;
    ai: AIService;
    queue: ChatbotQueue;
    stream: StreamService;
    bots: Map<BotName, ChatbotService>;
    moderator: ModeratorBotService;
  };

  async initialize() {
    // Create services in dependency order
    this.services = {
      tokens: new TokenManager(),
      chatListener: new ChatListenerService(),
      messageWindow: new ChatMessageWindow(),
      ai: new AIService(),
      queue: new ChatbotQueue(),
      bots: new Map(),
      moderator: null as any,
      stream: null as any
    };

    // Create bots
    for (const botName of ['friendly', 'sassy'] as BotName[]) {
      this.services.bots.set(
        botName,
        await ChatbotService.create(this.services.tokens, botName)
      );
    }

    // Create moderator
    this.services.moderator = await ModeratorBotService.create(
      this.services.tokens,
      'moderator'
    );

    // Wire up message flow
    this.setupMessageFlow();

    // Setup stream lifecycle
    this.services.stream = await StreamService.create({
      tokenManager: this.services.tokens,
      onStreamOnline: () => this.handleStreamOnline(),
      onStreamOffline: () => this.handleStreamOffline()
    });
  }

  private setupMessageFlow() {
    this.services.chatListener.on('message', async (msg) => {
      // Update context
      this.services.messageWindow.addMessage(msg);

      // Check if moderation needed
      if (await this.needsModeration(msg)) {
        this.services.queue.addMessage('moderator', async () => {
          await this.services.moderator.timeout(msg.user, 60);
          this.services.moderator.say(`${msg.user} has been timed out`);
        });
        return;
      }

      // Route to appropriate bots
      for (const [botName, bot] of this.services.bots) {
        if (msg.message.includes(`@${botName}`) || Math.random() < 0.25) {
          this.services.queue.addMessage(botName, async () => {
            const response = await this.services.ai.generateResponse({
              botName,
              triggerMessage: msg.message,
              context: this.services.messageWindow.messages
            });
            if (response) bot.say(response);
          });
        }
      }
    });
  }

  private handleStreamOnline() {
    this.services.chatListener.start();
    this.services.moderator.joinChannel();
    this.services.bots.forEach(bot => bot.joinChannel());
  }

  private handleStreamOffline() {
    this.services.chatListener.stop();
    this.services.moderator.leaveChannel();
    this.services.bots.forEach(bot => bot.leaveChannel());
    this.services.queue.stop();
  }
}

// src/index.ts
const manager = new ServiceManager();
await manager.initialize();
```

## My Recommendation

I recommend **Option 1 (Simple Coordinator)** because:

1. **All services are visible** in one place
2. **Clear data flow**: ChatListener → MessageWindow → AI → Queue → Bots
3. **Simple to understand** - no abstractions, just straightforward wiring
4. **Easy to modify** - want to add a bot? Just add it to the map
5. **Explicit lifecycle** - you can see exactly what happens when stream goes online/offline

The key insight is that your ChatListener is the single source of chat messages, and everything else reacts to those messages. The coordinator pattern makes this flow crystal clear.