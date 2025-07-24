# Concurrent Message Handling Fix Plan

## Problem Summary

The current message handling system cannot properly handle rapid incoming messages. When multiple messages arrive quickly (e.g., 10 messages within 1-2 seconds), the `MessageRouter.scheduleResponses()` method calls `clearResponseTimers()` which cancels ALL pending bot responses. This results in only the last message receiving bot responses while all previous messages are ignored.

## Root Cause

```typescript
// In MessageRouter.scheduleResponses()
private scheduleResponses(responses: ScheduledResponse[], context: MessageContext): void {
  // This clears ALL timers, not just for this message!
  this.clearResponseTimers();
  // ...
}
```

## Solution: Simplified P-Queue Implementation

### 1. Install Dependencies

```bash
bun add p-queue
```

### 2. Architecture Changes

#### Current Flow (Broken)
```
Message 1 → Schedule Response → Timer Set
Message 2 → Clear ALL Timers → Schedule Response → Timer Set
Message 3 → Clear ALL Timers → Schedule Response → Timer Set
Result: Only Message 3 gets a response
```

#### New Flow (Fixed)
```
Message 1 → Queue Task (with delay) → Response
Message 2 → Queue Task (with delay) → Response  
Message 3 → Queue Task (with delay) → Response
Result: All messages get responses with proper delays
```

### 3. Implementation Plan

#### Key Insight: No Separate Timer Management Needed

Instead of managing timers separately from the queue, we'll include the delay INSIDE the queued task. This simplifies the code significantly and treats the delay as part of the bot's "thinking" time.

#### Phase 1: Add Queue Infrastructure

1. **Import p-queue** in `message-router.service.ts`
2. **Create queue instances**:
   - Global queue with concurrency limit (5)
   - Per-bot queues with concurrency limit (2)
3. **Remove timer tracking** - No need for `responseTimers` Map!

#### Phase 2: Refactor Message Handling

1. **Simplify class structure**:
   ```typescript
   import PQueue from 'p-queue';
   
   export class MessageRouter {
     private globalQueue: PQueue;
     private botQueues: Map<BotName, PQueue>;
     // Remove: private responseTimers: Map<string, NodeJS.Timeout>;
     
     constructor(
       private botManager: BotManager,
       private orchestrator: MultiBotOrchestratorV2
     ) {
       this.globalQueue = new PQueue({ concurrency: 5 });
       this.botQueues = new Map();
       
       for (const botName of BOT_NAMES) {
         this.botQueues.set(botName, new PQueue({ concurrency: 2 }));
       }
     }
   }
   ```

2. **Update `handleIncomingMessage()`**:
   ```typescript
   async handleIncomingMessage(
     channel: string,
     username: string,
     text: string,
     msg: ChatMessage
   ): Promise<void> {
     const context: MessageContext = {
       channel,
       username,
       text,
       timestamp: Date.now(),
       mentions: this.extractMentions(text)
     };
     
     const responses = await this.orchestrator.determineResponses(context);
     
     // Queue each response immediately (no timer management needed)
     for (const response of responses) {
       this.queueResponse(response, context);
     }
   }
   ```

3. **Implement simplified `queueResponse()`**:
   ```typescript
   private queueResponse(
     response: ScheduledResponse,
     context: MessageContext
   ): void {
     const botQueue = this.botQueues.get(response.botName)!;
     
     // Add to both queues - delay happens INSIDE the task
     this.globalQueue.add(() =>
       botQueue.add(async () => {
         // Natural delay happens here as part of the queued task
         await this.sleep(response.delay);
         await this.executeResponse(response.botName, context);
       })
     );
   }
   
   private sleep(ms: number): Promise<void> {
     return new Promise(resolve => setTimeout(resolve, ms));
   }
   ```

4. **Remove unnecessary methods**:
   - Delete `scheduleResponses()`
   - Delete `clearResponseTimers()`
   - Delete timer management code

#### Phase 3: Cleanup

1. **Update `stop()` method**:
   ```typescript
   stop(): void {
     // Clear queues instead of timers
     this.globalQueue.clear();
     this.botQueues.forEach(queue => queue.clear());
   }
   ```

2. **Add error handling** for queue operations

### 4. Benefits of This Simplified Approach

1. **Much simpler code**: No separate timer management system
2. **Single source of truth**: Queue manages everything
3. **Natural rate limiting**: Bot "occupies" a concurrency slot while thinking
4. **No timer cleanup needed**: Queues handle their own lifecycle
5. **Easier to debug**: One system instead of two interacting systems

### 5. Configuration

```typescript
interface QueueConfig {
  maxGlobalConcurrency: number; // Default: 5
  maxPerBotConcurrency: number; // Default: 2
  // No timeout needed - delays are part of the task
}
```

### 6. Complete Example

```typescript
import PQueue from 'p-queue';
import { BotName, MessageContext, ScheduledResponse } from './types';

export class MessageRouter {
  private globalQueue: PQueue;
  private botQueues: Map<BotName, PQueue>;

  constructor(
    private botManager: BotManager,
    private orchestrator: MultiBotOrchestratorV2
  ) {
    this.globalQueue = new PQueue({ concurrency: 5 });
    this.botQueues = new Map();
    
    for (const botName of BOT_NAMES) {
      this.botQueues.set(botName, new PQueue({ concurrency: 2 }));
    }
  }

  async handleIncomingMessage(
    channel: string,
    username: string,
    text: string,
    msg: ChatMessage
  ): Promise<void> {
    const context: MessageContext = {
      channel,
      username,
      text,
      timestamp: Date.now(),
      mentions: this.extractMentions(text)
    };

    const responses = await this.orchestrator.determineResponses(context);
    
    // Queue each response immediately
    for (const response of responses) {
      this.queueResponse(response, context);
    }
  }

  private queueResponse(
    response: ScheduledResponse,
    context: MessageContext
  ): void {
    const botQueue = this.botQueues.get(response.botName)!;
    
    // Add to both queues - delay happens INSIDE the task
    this.globalQueue.add(() =>
      botQueue.add(async () => {
        try {
          // Natural delay happens here
          await this.sleep(response.delay);
          await this.executeResponse(response.botName, context);
        } catch (error) {
          console.error(`Failed to execute response for ${response.botName}:`, error);
        }
      })
    );
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

    await bot.respondTo(context);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  stop(): void {
    // Clear all queues
    this.globalQueue.clear();
    this.botQueues.forEach(queue => queue.clear());
  }

  // ... other methods like extractMentions, analyzeMessageTriggers, etc.
}
```

### 7. Testing Plan

1. **Unit Tests**:
   - Test rapid message handling (10+ messages in < 1 second)
   - Verify all messages receive responses
   - Confirm response delays are maintained
   - Test concurrency limits

2. **Integration Tests**:
   - Simulate real Twitch chat scenarios
   - Test with multiple bots responding
   - Verify no message dropping

3. **Load Tests**:
   - 50+ rapid messages
   - Mixed priorities (mentions vs random)
   - Memory usage monitoring

### 8. Migration Steps

1. Create feature branch
2. Install p-queue dependency
3. Remove timer-related code
4. Implement simplified queue-based message handling
5. Add comprehensive tests
6. Test in development environment
7. Deploy with monitoring

### 9. Monitoring

After deployment, monitor:
- Response rates
- Queue sizes (using `queue.size` and `queue.pending`)
- Processing delays
- Memory usage
- Error rates

## Why This Approach is Better

The key insight is that **we don't need separate systems for delays and concurrency control**. By putting the delay inside the queued task:

1. The delay becomes part of the bot's "work"
2. Concurrency limits naturally prevent response flooding
3. We eliminate an entire category of bugs related to timer management
4. The code is much easier to understand and maintain

This is a perfect example of how questioning assumptions (do we really need separate timer tracking?) can lead to much simpler, more robust solutions.