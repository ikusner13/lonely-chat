# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Lonely Chat** - AI-powered Twitch chat bots to solve loneliness by creating engaging, personality-driven conversations in stream chats.

### Core Features
- AI-powered bots with distinct personalities that engage naturally in Twitch chat
- Uses Vercel AI SDK v5 with OpenRouter for diverse model support
- Multiple bots that participate as regular chat members
- Single chat listener reads all messages; bots are write-only
- Bots respond to mentions (@botname) and randomly participate (25% chance)
- Includes moderation bot with timeout capabilities
- Hot-reload configuration without disconnecting bots
- Unified auth dashboard for token management

## Key Technologies

- **Runtime**: Bun (v1.2.19+)
- **Language**: TypeScript
- **Framework**: Hono (for auth server)
- **Twitch Integration**: Twurple (auth, chat, eventsub)
- **AI Framework**: Vercel AI SDK v5 with OpenRouter provider
- **AI Models**: Access to multiple models (Llama, Claude, GPT-4, Gemini, DeepSeek)
- **Configuration**: TOML format with hot-reload support
- **Logging**: Pino with pretty-print
- **Build Tool**: tsdown for production builds
- **Container**: Docker with multi-stage builds

## Project Structure

### Main Application (`/main`)
- `/main/src/index.ts` - Entry point with signal handling for config reload
- `/main/src/app.ts` - Application coordinator that wires all services
- `/main/src/services/`
  - `stream.service.ts` - Stream status monitoring via EventSub WebSocket
  - `chat-listener.service.ts` - Single source for reading all chat messages
  - `chat-message-window.ts` - Sliding window of chat context (10 messages, 10 min expiry)
  - `bot-response-coordinator.ts` - Decides which bots respond to messages
  - `ai.service.ts` - AI integration using Vercel AI SDK and OpenRouter
  - `chatbot-queue.ts` - Manages response timing and rate limiting
  - `chatbot.service.ts` - Write-only Twitch chat clients for each bot
  - `moderatorbot.service.ts` - Special bot with moderation capabilities
  - `bot-manager.ts` - Orchestrates bot lifecycle and connections
  - `bot-factory.ts` - Creates bot instances based on configuration
  - `config-manager.ts` - Handles bot configuration with hot-reload support

### Auth Server (`/auth`)
- `/auth/src/index.ts` - Auth server entry with localtunnel for OAuth
- `/auth/src/app.tsx` - Hono app with dashboard and API routes
- `/auth/src/components/` - React-like components for dashboard UI
- `/auth/src/routes/` - OAuth flow handlers for different token types
- `/auth/src/lib/oauth.ts` - Twitch OAuth implementation

### Shared Code (`/shared`)
- `env.ts` - Environment variable validation with zod
- `logger.ts` - Pino logger factory
- `sqlite-token-store.ts` - SQLite-based token persistence
- `token.service.ts` - Token management and validation

### Configuration (`/config`)
- `bots.toml` - Bot configuration (personalities, models, settings)
- `bots.toml.example` - Example configuration with 4 sample bots

### Docker Setup
- `docker-compose.local.yml` - Local development setup
- `docker-compose.production.yml` - Production deployment with ghcr.io images
- `main/Dockerfile` - Multi-stage build for main app
- `auth/Dockerfile` - Multi-stage build for auth server

## Essential Commands

### Development

```bash
# Install dependencies
bun install

# Start auth dashboard (RECOMMENDED for token management)
bun run auth
# Opens http://localhost:8080 with tunnel for OAuth callbacks

# Run the main application
bun run dev        # Normal mode
bun run dev:hot    # Hot reload mode

# Test AI responses
bun run playground
```

### Code Quality

```bash
bun run type-check  # TypeScript validation
bun run lint        # Run Biome linter
bun run format      # Format code with Biome
```

### Building & Deployment

```bash
# Build for production
bun run build       # Builds both main and auth apps

# Docker commands
bun run docker:build    # Build Docker images
bun run docker:up       # Start services
bun run docker:down     # Stop services
bun run docker:logs     # View logs
bun run docker:restart  # Restart services
bun run docker:shell    # Access container shell
```

## Architecture Notes

### Message Flow

1. **StreamService** monitors stream status via EventSub WebSocket
2. **ChatListenerService** reads ALL chat messages (single source of truth)
3. **ChatMessageWindow** maintains sliding context window for AI
4. **BotResponseCoordinator** decides which bots should respond
5. **AIService** generates responses using bot personality + chat context
6. **ChatbotQueue** schedules responses with natural delays (1-3 sec)
7. **ChatbotService** instances send messages (write-only)

### Service Lifecycle

- Services are created but NOT connected on app start
- StreamService checks if stream is already online
- When stream online: ChatListener starts, all bots connect
- When stream offline: ChatListener stops, all bots disconnect, queue clears
- Config reload (SIGHUP): Updates bot settings without disconnecting

### Bot Types

- **Regular Bots**: Write-only, respond to mentions and participate randomly
- **Moderator Bot**: Special bot with timeout capabilities, sends confirmation messages

### AI Integration

- Each bot has distinct personality, model, temperature settings
- All bots receive the same chat context from ChatMessageWindow
- Responses are generated based on bot personality + context
- Fallback models ensure reliability if primary model fails

### Configuration Management

- Hot-reload via SIGHUP signal (no downtime)
- TOML format for easy editing
- Validation before applying changes
- Per-bot settings: name, role, model, temperature, maxTokens, systemPrompt
- Optional: introMessage, fallbackModels

## Environment Variables

### Required
```
TWITCH_CLIENT_ID=your_client_id
TWITCH_CLIENT_SECRET=your_client_secret
TWITCH_CHANNEL_ID=your_channel_id
TWITCH_CHANNEL_NAME=your_channel_name
OPENROUTER_KEY=your_openrouter_api_key
```

### Optional
```
# Development only
LOCALTUNNEL_SUBDOMAIN=stable-subdomain-for-oauth

# Production paths
BOT_CONFIG_PATH=/path/to/bots.toml
TOKEN_DB_PATH=/path/to/tokens.db

# Environment
NODE_ENV=production
PORT=8080  # For auth server

# Logging
LOG_LEVEL=info  # debug, info, warn, error
```

## Recent Updates

- Migrated from JSON to SQLite for token storage
- Added unified auth dashboard with React-like components
- Implemented hot-reload configuration system
- Docker multi-stage builds for smaller images
- Improved error handling and logging throughout
- Added support for multiple fallback AI models
- Enhanced bot response coordination logic