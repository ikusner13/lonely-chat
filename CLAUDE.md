# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

goal: twitch bots to solve loneliness

- AI-powered bots with distinct personalities that engage naturally in Twitch chat
- Uses Vercel AI SDK v5 with OpenRouter for diverse model support
- Supports multiple bots that can have autonomous conversations
- Currently configured for single bot operation but ready for multi-bot scaling
- Bots respond to chat messages, questions, and can initiate conversations

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

# Generate channel token (for EventSub)
bun run generate-channel-token

# Generate bot tokens
bun run generate-bot-token <bot-name>

# Run the bot orchestrator
bun run dev
```

### Testing, Linting, and Building

Currently, no test, lint, or build commands are configured. Bun executes TypeScript files directly without a build step.

## Project Structure

- `/src/index.ts` - Main entry point that starts the MultiBotOrchestrator
- `/src/MultiBotOrchestrator.ts` - Manages multiple bot instances and conversation flow
- `/src/services/ai.service.ts` - AI integration using Vercel AI SDK and OpenRouter
- `/src/services/chatbot.service.ts` - Twitch chat client wrapper
- `/src/services/eventsub.service.ts` - Twitch EventSub for stream online/offline events
- `/src/services/stream.service.ts` - Stream status monitoring
- `/tokens.json` - Stores OAuth tokens for channel and bots

## Architecture Notes

### AI Integration
- **Shared Context**: All bots share a conversation context but interpret it through their personalities
- **Response Coordination**: Orchestrator prevents response flooding and manages turn-taking
- **Personality System**: Each bot has configurable personality, model, temperature, and interests
- **Context Management**: Automatic trimming and cleanup of old conversations

### Bot Behavior
- Responds to direct mentions (@botname)
- Engages with questions (30% chance)
- Responds to greetings (20% chance)
- Can initiate autonomous conversations (multi-bot only)
- Natural response delays to feel human-like

### Single vs Multi-Bot
- Single bot: Uses "friendly" personality by default, higher engagement rates
- Multi-bot: Bots have different personalities and can converse with each other
- Autonomous conversations only trigger with 2+ bots

### Available Bot Personalities
- **FriendlyBot**: Enthusiastic, uses emotes, keeps chat fun
- **MemeLord**: Meme-obsessed, uses Twitch culture references
- **BigBrainStrat**: Strategic thinker, analyzes gameplay
- **HypeSquad**: Ultimate positivity, celebrates everything
- **LoreKeeper**: Deep knowledge about games and stories

### Environment Variables Required
```
TWITCH_CLIENT_ID=your_client_id
TWITCH_CLIENT_SECRET=your_client_secret
TWITCH_CHANNEL_ID=your_channel_id
TWITCH_CHANNEL_NAME=your_channel_name
OPENROUTER_KEY=your_openrouter_api_key
```
