# Architecture Refactoring Plan: MultiBotOrchestrator

## Overview

This document outlines a comprehensive refactoring plan to transform the current `MultiBotOrchestrator` from a monolithic "God Object" into a clean, modular architecture following the Single Responsibility Principle.

## Current Problems

The `MultiBotOrchestrator` currently violates several SOLID principles:

- **Single Responsibility**: It handles service initialization, message routing, bot coordination, stream monitoring, and more
- **Dependency Inversion**: It directly creates and manages its dependencies
- **Open/Closed**: Adding new features requires modifying the orchestrator itself

## Proposed Architecture

### High-Level Design

```
┌─────────────────────┐
│   AppBootstrapper   │ ← Entry point, wires everything up
└──────────┬──────────┘
           │
    ┌──────┴──────┬────────────────┬─────────────────┐
    │             │                │                 │
┌───▼────┐  ┌────▼─────┐  ┌───────▼──────┐  ┌──────▼──────┐
│Stream   │  │Message   │  │MultiBotᅟ     │  │Supporting   │
│Lifecycle│  │Router    │  │Orchestrator  │  │Services     │
│Manager  │  │          │  │(refactored)  │  │             │
└─────────┘  └──────────┘  └──────────────┘  └─────────────┘
```

### Component Responsibilities

#### 1. AppBootstrapper (New)

**Purpose**: Application initialization and dependency injection

**Responsibilities**:

- Load and validate environment variables
- Initialize TokenManager and load tokens
- Create all services in correct dependency order
- Wire up event handlers between components
- Start the application
- Handle graceful shutdown

**Key Methods**:

```typescript
class AppBootstrapper {
  async bootstrap(): Promise<Application>;
  private async initializeServices(): Promise<ServiceContainer>;
  private wireEventHandlers(): void;
  async shutdown(): Promise<void>;
}
```

**Flow**:

1. Load environment config
2. Initialize TokenManager → Load tokens
3. Create core services (ConversationManager, AIService)
4. Initialize Twitch services (StreamService, EventSubService)
5. Create BotManager → Initialize all bots
6. Create coordination layer (MessageRouter, MultiBotOrchestrator)
7. Wire all event connections
8. Return running Application instance

#### 2. StreamLifecycleManager (New)

**Purpose**: Monitor and manage stream state and bot connections

**Responsibilities**:

- Monitor stream online/offline status via EventSub
- Connect/disconnect bots based on stream state
- Manage EventSub subscriptions lifecycle
- Handle token refresh for channel
- Emit stream state change events

**Key Methods**:

```typescript
class StreamLifecycleManager extends EventEmitter {
  constructor(
    eventSubService: EventSubService,
    streamService: StreamService,
    botManager: BotManager
  );

  async start(): Promise<void>;
  async checkInitialStreamState(): Promise<void>;
  private handleStreamOnline(): Promise<void>;
  private handleStreamOffline(): Promise<void>;
  async stop(): Promise<void>;
}
```

**Events Emitted**:

- `stream:online` - Stream went live
- `stream:offline` - Stream ended
- `bots:connected` - All bots connected to chat
- `bots:disconnected` - All bots disconnected

#### 3. MessageRouter (New)

**Purpose**: Central message handling and routing

**Responsibilities**:

- Receive all incoming chat messages from all bots
- Filter out bot-to-bot messages (prevent loops)
- Parse message for triggers and context
- Route to orchestrator for coordination decisions
- Execute orchestrator decisions (schedule bot responses)
- Handle the actual message sending

**Key Methods**:

```typescript
interface MessageContext {
  channel: string;
  user: string;
  message: string;
  timestamp: Date;
  isQuestion: boolean;
  mentionedBots: BotName[];
}

interface BotResponse {
  botName: BotName;
  delay: number;
  priority: "high" | "normal" | "low";
}

class MessageRouter {
  constructor(
    botManager: BotManager,
    orchestrator: MultiBotOrchestrator,
    aiService: AIService
  );

  handleIncomingMessage(context: MessageContext): Promise<void>;
  private scheduleBotResponses(responses: BotResponse[]): void;
  private executeBotResponse(
    botName: BotName,
    context: MessageContext
  ): Promise<void>;
}
```

**Flow**:

1. Receive message from any bot's chat client
2. Check if sender is a bot (ignore if yes)
3. Create MessageContext with analysis
4. Pass to orchestrator: `orchestrator.determineResponses(context)`
5. Receive array of `BotResponse` decisions
6. Schedule each response with specified delay
7. When timer fires: Generate AI response → Send via bot

#### 4. MultiBotOrchestrator (Refactored)

**Purpose**: Pure coordination logic for multi-bot conversations

**Responsibilities**:

- Analyze message context to determine response strategy
- Decide which bot(s) should respond
- Calculate appropriate response delays
- Manage conversation flow and turn-taking
- Prevent response flooding
- Track conversation state (minimal)

**Key Methods**:

```typescript
interface ConversationState {
  isActive: boolean;
  lastSpeaker?: string;
  lastMessageTime: Date;
  messagesSinceLastBot: number;
}

class MultiBotOrchestrator {
  private conversationState: ConversationState;
  private config: OrchestratorConfig;

  determineResponses(context: MessageContext): BotResponse[];
  private shouldBotRespond(botName: BotName, context: MessageContext): boolean;
  private calculateResponsePriority(
    botName: BotName,
    context: MessageContext
  ): Priority;
  private calculateDelay(index: number, priority: Priority): number;
}
```

**Decision Logic**:

- Direct mentions (@botname) → High priority, short delay
- Questions → 30% chance, normal priority
- Continuing conversation → Based on personality fit
- Multiple bots → Stagger delays, max 3 per turn

**Key Point**: This class has NO dependencies on Twitch, AI, or any external services. It's pure business logic.

#### 5. Supporting Services (Existing, minimal changes)

**BotManager**:

- Manages bot client instances
- Handles bot authentication
- Provides bot connection/disconnection
- Tracks bot state and readiness

**AIService**:

- Generates contextual responses
- Manages conversation memory
- Interfaces with OpenRouter/LLM

**ConversationManager**:

- Stores conversation history
- Provides context for AI
- Handles context pruning

**TokenManager**:

- Loads/saves OAuth tokens
- Handles token refresh
- Provides token access

## Implementation Plan

### Phase 1: Create New Components (No Breaking Changes)

1. Implement `AppBootstrapper` alongside existing code
2. Create `StreamLifecycleManager` (extract from orchestrator)
3. Create `MessageRouter` (extract routing logic)
4. Test new components in isolation

### Phase 2: Refactor Orchestrator

1. Create new `MultiBotOrchestratorV2` with pure coordination logic
2. Remove all initialization code
3. Remove all Twitch/service dependencies
4. Focus on decision-making only

### Phase 3: Integration

1. Update `index.ts` to use `AppBootstrapper`
2. Wire up all components through bootstrapper
3. Test full system with new architecture
4. Remove old orchestrator code

### Phase 4: Cleanup

1. Remove duplicate code
2. Update tests
3. Update documentation
4. Add dependency injection interfaces

## Benefits

1. **Testability**: Each component can be tested in isolation
2. **Maintainability**: Clear responsibilities, easier to debug
3. **Extensibility**: Easy to add new bot types, triggers, or services
4. **Reusability**: Components can be reused in different contexts
5. **Performance**: Better resource management, cleaner shutdown

## Migration Path

```typescript
// Old way (index.ts)
const orchestrator = new MultiBotOrchestrator();
await orchestrator.start();

// New way (index.ts)
const app = await new AppBootstrapper().bootstrap();
await app.start();

// Graceful shutdown
process.on("SIGINT", async () => {
  await app.shutdown();
  process.exit(0);
});
```

## Example: Message Flow

1. User types: "Hey @friendly, what's up?"
2. All bot clients receive the message
3. `MessageRouter` intercepts via registered handler
4. Router creates `MessageContext`:
   ```typescript
   {
     channel: "coolstreamer",
     user: "viewer123",
     message: "Hey @friendly, what's up?",
     mentionedBots: ["friendly"],
     isQuestion: true
   }
   ```
5. Router calls `orchestrator.determineResponses(context)`
6. Orchestrator returns:
   ```typescript
   [
     {
       botName: "friendly",
       delay: 1500,
       priority: "high",
     },
   ];
   ```
7. Router schedules response for 1.5s later
8. After delay, Router calls AI service to generate response
9. Router sends message via BotManager

## Testing Strategy

Each component can be tested independently:

- **AppBootstrapper**: Test initialization order, error handling
- **StreamLifecycleManager**: Test stream state transitions
- **MessageRouter**: Test routing logic, scheduling
- **MultiBotOrchestrator**: Test decision logic with mock contexts
- **Integration**: Test full message flow end-to-end

## Future Enhancements

This architecture enables:

- Plugin system for custom triggers
- Different orchestration strategies (round-robin, personality-based)
- Message queue for high-volume chats
- Distributed bot hosting
- Analytics and monitoring hooks
- A/B testing different response strategies
