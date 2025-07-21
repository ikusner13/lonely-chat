# New Architecture (Phase 3 Complete)

## Overview

The application has been refactored to use a clean, modular architecture that separates concerns and improves testability.

## Key Components

### 1. **AppBootstrapper** (`app-bootstrapper.ts`)
- Initializes all services in the correct order
- Wires up dependencies between components
- Handles event listener setup
- Returns an Application instance for lifecycle management

### 2. **StreamLifecycleManager** (`services/stream-lifecycle-manager.service.ts`)
- Manages stream online/offline states
- Controls bot connections based on stream status
- Handles EventSub integration
- Emits events for stream state changes

### 3. **MessageRouter** (`services/message-router.service.ts`)
- Routes incoming Twitch messages to appropriate handlers
- Processes all messages from all chat participants equally
- Schedules bot responses with appropriate delays
- Manages response timers

### 4. **MultiBotOrchestratorV2** (`multi-bot-orchestrator-v2.ts`)
- Pure orchestration logic with no external dependencies
- Determines which bots should respond and when
- Manages conversation state
- Implements response priority system

## Architecture Benefits

1. **Separation of Concerns**: Each component has a single, well-defined responsibility
2. **Testability**: Components can be tested in isolation
3. **Event-Driven**: Loose coupling through event emitters
4. **No Circular Dependencies**: Clean dependency graph
5. **Easy to Extend**: New features can be added without modifying core logic

## Running the Application

```bash
# Start the application
bun run dev

# Run tests
bun run test:architecture    # Test component initialization
bun run test:integration     # Full system integration test
bun run test:message-flow    # Test realistic chat scenarios
```

## Message Flow

1. User sends message in Twitch chat
2. BotManager receives message and forwards to MessageRouter
3. MessageRouter processes message and creates context
4. MessageRouter asks Orchestrator for response decisions
5. Orchestrator returns which bots should respond and when
6. MessageRouter schedules responses with appropriate delays
7. AI Service generates response content
8. Bot sends message to Twitch chat

## Migration from Old Architecture

The old `MultiBotOrchestrator` has been replaced with:
- `AppBootstrapper` for initialization
- `StreamLifecycleManager` for stream state management
- `MessageRouter` for message handling
- `MultiBotOrchestratorV2` for pure orchestration logic