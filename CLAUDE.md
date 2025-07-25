# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

goal: twitch bots to solve loneliness

- AI-powered bots with distinct personalities that engage naturally in Twitch chat
- Uses Vercel AI SDK v5 with OpenRouter for diverse model support
- Multiple bots that participate as regular chat members
- Single chat listener reads all messages; bots are write-only
- Bots respond to mentions (@botname) and randomly participate (25% chance)
- Includes moderation bot with timeout capabilities

## Key Technologies

- **Runtime**: Bun
- **Language**: TypeScript
- **Twitch Integration**: Twurple (auth, chat, eventsub)
- **AI Framework**: Vercel AI SDK v5 with OpenRouter provider
- **AI Models**: Access to multiple models (Llama, Claude, GPT-4, Gemini)

## Essential Commands

### Development

```bash
# Install dependencies
bun install

# Generate all tokens via unified auth server (NEW - RECOMMENDED)
bun run auth
# This opens a dashboard where you can:
# - Generate channel token for EventSub
# - Generate bot tokens with chat permissions
# - Generate moderator bot tokens with mod permissions
# - View all existing tokens and their status
# - Refresh expired tokens

# Legacy token generation (still available)
bun run generate-channel-token
bun run generate-token <bot-name>
bun run generate-moderator-token <bot-name>

# Run the bot orchestrator
bun run dev
```

### Testing, Linting, and Building

Currently, no test, lint, or build commands are configured. Bun executes TypeScript files directly without a build step.

## Project Structure

- `/src/index.ts` - Main entry point that creates and starts the App coordinator
- `/src/app.ts` - Simple coordinator that wires all services together
- `/src/services/chat-listener.service.ts` - Single source for reading all chat messages
- `/src/services/chat-message-window.ts` - Maintains sliding window of chat context for AI
- `/src/services/chatbot-queue.ts` - Manages response concurrency and natural delays
- `/src/services/ai.service.ts` - AI integration using Vercel AI SDK and OpenRouter
- `/src/services/chatbot.service.ts` - Write-only Twitch chat clients for each bot
- `/src/services/moderatorbot.service.ts` - Special bot with moderation capabilities
- `/src/services/stream.service.ts` - Stream status monitoring and lifecycle events
- `/src/services/token.service.ts` - Manages bot and channel OAuth tokens
- `/tokens.json` - Stores OAuth tokens for channel and bots

## Architecture Notes

### Message Flow

1. **ChatListenerService** reads ALL chat messages (single source of truth)
2. **ChatMessageWindow** maintains sliding context window (10 messages, 10 min expiry)
3. **App coordinator** decides which bots should respond (mentions or 25% random)
4. **AIService** generates responses using bot personality + chat context
5. **ChatbotQueue** schedules responses with natural delays (1-3 sec)
6. **ChatbotService** instances send messages (write-only)

### Service Lifecycle

- Services are created but NOT connected on app start
- StreamService checks if stream is already online
- When stream online: ChatListener starts, all bots connect
- When stream offline: ChatListener stops, all bots disconnect, queue clears

### Bot Types

- **Regular Bots**: Write-only, respond to mentions and participate randomly
- **Moderator Bot**: Special bot with timeout capabilities, sends confirmation messages

### AI Integration

- Each bot has distinct personality, model, temperature settings
- All bots receive the same chat context from ChatMessageWindow
- Responses are generated based on bot personality + context

### Environment Variables Required

```
TWITCH_CLIENT_ID=your_client_id
TWITCH_CLIENT_SECRET=your_client_secret
TWITCH_CHANNEL_ID=your_channel_id
TWITCH_CHANNEL_NAME=your_channel_name
OPENROUTER_KEY=your_openrouter_api_key
```
