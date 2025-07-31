# Lonely Chat - AI-Powered Twitch Chat Bots

A sophisticated Twitch bot service that brings AI-powered personalities to your stream chat. Create a lively, engaging atmosphere with multiple bots that have distinct personalities, powered by various AI models through OpenRouter.

## 🌟 Key Features

### Smart Bot Management
- **Automatic Stream Detection**: Bots connect when stream goes online, disconnect when offline
- **Multi-Bot Support**: Run multiple bots simultaneously, each with unique personalities
- **Natural Interactions**: Bots respond to mentions (@botname) and randomly participate (25% chance)
- **Moderation Support**: Dedicated moderator bots with timeout capabilities

### Advanced AI Integration
- **Multiple AI Models**: Access to Llama, Claude, GPT-4, Gemini, and more via OpenRouter
- **Context-Aware Responses**: Bots maintain chat context for natural conversations
- **Personality System**: Each bot has customizable personality, temperature, and response style
- **Fallback Models**: Automatic failover to alternative models if primary fails

### Live Configuration
- **Hot Reload**: Update bot personalities without restarting or disconnecting
- **No Downtime**: Changes apply instantly while bots stay connected
- **Safe Updates**: Validation ensures bad configs don't crash your bots

### Easy Token Management
- **Unified Auth Dashboard**: Web interface for managing all tokens
- **OAuth Flow**: Secure token generation with proper scopes
- **Token Refresh**: Automatic and manual token refresh capabilities
- **Visual Status**: See token health and expiration at a glance

## 🚀 Quick Start

### Option 1: Using Pre-built Docker Images (Recommended)

The easiest way to get started is using the published Docker images from GitHub Container Registry.

#### Prerequisites
- Docker and Docker Compose installed
- Twitch application credentials ([create one here](https://dev.twitch.tv/console/apps))
- OpenRouter API key ([get one here](https://openrouter.ai))

#### Quick Setup

1. **Create a new directory for your deployment**:
```bash
mkdir lonely-chat && cd lonely-chat
```

2. **Create docker-compose.yml**:
```yaml
services:
  lonely-chat:
    image: ghcr.io/ikusner13/lonely-chat:latest
    pull_policy: always
    restart: unless-stopped
    env_file:
      - .env
    environment:
      - NODE_ENV=production
      - BOT_CONFIG_PATH=/app/config/bots.toml
      - TOKEN_DB_PATH=/data/tokens.db
    volumes:
      - tokens-data:/data
      - ./bots.toml:/app/config/bots.toml:ro

  lonely-chat-auth:
    image: ghcr.io/ikusner13/lonely-chat-auth:latest
    restart: unless-stopped
    environment:
      - NODE_ENV=production
      - PORT=8080
      - TOKEN_DB_PATH=/data/tokens.db
    env_file:
      - .env
    volumes:
      - tokens-data:/data
    ports:
      - "8080:8080"

volumes:
  tokens-data:
    driver: local
```

3. **Continue with Configuration steps below**

### Option 2: Building from Source

#### Prerequisites
- [Bun](https://bun.sh) runtime installed
- Twitch application credentials ([create one here](https://dev.twitch.tv/console/apps))
- OpenRouter API key ([get one here](https://openrouter.ai))

#### Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/lonely-chat.git
cd lonely-chat

# Install dependencies
bun install

# Copy example config
cp config/bots.toml.example config/bots.toml
```

### Configuration

1. **Create `.env` file**:
```env
# Twitch App Credentials
TWITCH_CLIENT_ID=your_client_id
TWITCH_CLIENT_SECRET=your_client_secret

# Your Channel Info
TWITCH_CHANNEL_ID=your_channel_user_id
TWITCH_CHANNEL_NAME=your_channel_username

# Auth Server (for development)
LOCALTUNNEL_SUBDOMAIN=my-twitch-auth

# AI Provider
OPENROUTER_KEY=your_openrouter_api_key
```

2. **Configure bots** (create `bots.toml` in your deployment directory):

   Download example configuration:
   ```bash
   wget https://raw.githubusercontent.com/ikusner13/lonely-chat/main/config/bots.toml.example -O bots.toml
   ```

   Or create manually:
   ```toml
   [[bots]]
   name = "friendlybot"
   role = "chatter"
   model = "meta-llama/llama-3.1-8b-instruct:free"
   temperature = 0.9
   maxTokens = 100
   systemPrompt = "You are a friendly and supportive Twitch chat bot..."
   ```

### Generate Tokens

#### For Docker Users:
```bash
# Start the auth service
docker compose up -d lonely-chat-auth

# Visit http://localhost:8080
# Generate tokens for:
# - Your channel (for stream monitoring)
# - Each bot account
# - Moderator bots (if needed)
```

#### For Source Users:
```bash
# Start the auth dashboard
bun run auth

# Visit http://localhost:8080
# Generate tokens as above
```

### Run the Service

#### Docker (Recommended):
```bash
# Start all services
docker compose up -d

# View logs
docker compose logs -f

# Stop services
docker compose down
```

#### From Source:
```bash
# Development
bun run dev

# Production with Docker
docker compose -f docker-compose.production.yml up -d
```

## 📖 Architecture Overview

### Service Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  StreamService  │────▶│ ChatListener     │────▶│ MessageWindow   │
│  (EventSub)     │     │ (Single Reader)  │     │ (Context)       │
└─────────────────┘     └──────────────────┘     └─────────────────┘
                                │                          │
                                ▼                          ▼
                        ┌───────────────┐         ┌────────────────┐
                        │ BotManager    │────────▶│ AI Service     │
                        │               │         │ (OpenRouter)   │
                        └───────────────┘         └────────────────┘
                                │
                                ▼
                        ┌───────────────┐
                        │ ChatbotQueue  │
                        │ (Rate Limit)  │
                        └───────────────┘
                                │
                                ▼
                        ┌───────────────┐
                        │ Chatbot       │
                        │ (Write Only)  │
                        └───────────────┘
```

### Key Components

- **StreamService**: Monitors stream status via EventSub WebSocket
- **ChatListenerService**: Single connection that reads all chat messages
- **ChatMessageWindow**: Maintains sliding window of recent messages for context
- **BotResponseCoordinator**: Decides which bots should respond to messages
- **AIService**: Generates responses using configured AI models
- **ChatbotQueue**: Manages response timing and rate limiting
- **BotManager**: Orchestrates bot lifecycle and connections

## 🛠️ Advanced Usage

### Docker Deployment Guide

#### Using Published Images

The project publishes two Docker images to GitHub Container Registry:
- `ghcr.io/ikusner13/lonely-chat:latest` - Main bot application
- `ghcr.io/ikusner13/lonely-chat-auth:latest` - Auth dashboard for token management

##### Complete Docker Setup

1. **Directory Structure**:
```
lonely-chat/
├── docker-compose.yml
├── .env
└── bots.toml
```

2. **docker-compose.yml** (production ready):
```yaml
services:
  lonely-chat:
    image: ghcr.io/ikusner13/lonely-chat:latest
    pull_policy: always
    restart: unless-stopped
    env_file:
      - .env
    environment:
      - NODE_ENV=production
      - BOT_CONFIG_PATH=/app/config/bots.toml
      - TOKEN_DB_PATH=/data/tokens.db
    volumes:
      - tokens-data:/data
      - ./bots.toml:/app/config/bots.toml:ro
    depends_on:
      - lonely-chat-auth

  lonely-chat-auth:
    image: ghcr.io/ikusner13/lonely-chat-auth:latest
    restart: unless-stopped
    environment:
      - NODE_ENV=production
      - PORT=8080
      - TOKEN_DB_PATH=/data/tokens.db
    env_file:
      - .env
    volumes:
      - tokens-data:/data
    ports:
      - "8080:8080"

volumes:
  tokens-data:
    driver: local
```

3. **Volume Persistence**:
   - Token database is stored in a named Docker volume
   - Bot configuration is mounted from host filesystem
   - Tokens persist across container restarts

4. **Updating Images**:
```bash
# Pull latest images
docker compose pull

# Restart with new images
docker compose up -d
```

### Live Configuration Updates

```bash
# Edit your bot config
nano bots.toml

# Apply changes without restart (Docker)
docker compose kill -s HUP lonely-chat

# Or for local development
kill -HUP $(pgrep -f "bun.*src/index.ts")
```

### Building Your Own Images

```bash
# Clone repository
git clone https://github.com/yourusername/lonely-chat.git
cd lonely-chat

# Build images
bun run docker:build

# Use docker-compose.local.yml for local builds
docker compose -f docker-compose.local.yml up -d
```

### Available Scripts

```bash
bun run dev              # Start in development mode
bun run dev:hot          # Start with hot reload
bun run auth             # Start auth dashboard
bun run playground       # Test AI responses
bun run type-check       # TypeScript validation
bun run lint             # Run linter
bun run format           # Format code
```

## 🔧 Configuration Reference

### Bot Configuration (bots.toml)

```toml
[[bots]]
name = "botname"                    # Twitch username
role = "chatter"                    # "chatter" or "moderator"
model = "model-name"                # OpenRouter model ID
temperature = 0.9                   # Response creativity (0.0-2.0)
maxTokens = 100                     # Max response length
fallbackModels = ["model1", "model2"] # Backup models
introMessage = "Hello!"             # Optional intro message
systemPrompt = """                  # Bot personality
Your personality and behavior...
"""
```

### Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `TWITCH_CLIENT_ID` | Twitch app client ID | Yes |
| `TWITCH_CLIENT_SECRET` | Twitch app client secret | Yes |
| `TWITCH_CHANNEL_ID` | Your channel's user ID | Yes |
| `TWITCH_CHANNEL_NAME` | Your channel username | Yes |
| `OPENROUTER_KEY` | OpenRouter API key | Yes |
| `LOCALTUNNEL_SUBDOMAIN` | Stable subdomain for auth | Development only |
| `NODE_ENV` | Environment (development/production) | No |
| `BOT_CONFIG_PATH` | Path to bots.toml | No (default: ./config/bots.toml) |
| `TOKEN_DB_PATH` | Path to token database | No (default: ./tokens.db) |

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🐛 Troubleshooting

### Common Issues

1. **Bots not connecting**: Ensure stream is online and tokens are valid
2. **No responses**: Check bot mentions format (@botname) and AI service logs
3. **Token errors**: Regenerate tokens through auth dashboard
4. **Config not updating**: Ensure proper SIGHUP signal is sent

### Docker-Specific Issues

1. **Auth dashboard not accessible**:
   - Ensure port 8080 is not already in use
   - Check firewall settings
   - Verify container is running: `docker compose ps`

2. **Tokens not persisting**:
   - Check volume is properly created: `docker volume ls`
   - Ensure containers share the same volume
   - Verify TOKEN_DB_PATH is set to `/data/tokens.db`

3. **Configuration changes not applying**:
   - Ensure bots.toml is in the correct location
   - Check file permissions (must be readable)
   - Use `docker compose exec lonely-chat cat /app/config/bots.toml` to verify

4. **Container keeps restarting**:
   - Check logs: `docker compose logs lonely-chat`
   - Verify all environment variables are set
   - Ensure .env file exists and is properly formatted

### Debug Mode

Enable detailed logging:

#### Docker:
```bash
# Add to docker-compose.yml environment section
environment:
  - LOG_LEVEL=debug
```

#### Development:
```bash
LOG_LEVEL=debug bun run dev
```

### Useful Docker Commands

```bash
# View real-time logs
docker compose logs -f

# Check container status
docker compose ps

# Access container shell
docker compose exec lonely-chat sh

# Restart specific service
docker compose restart lonely-chat

# Clean restart (removes volumes - WARNING: deletes tokens!)
docker compose down -v && docker compose up -d
```

## 📚 Resources

- [Twitch Developer Documentation](https://dev.twitch.tv/docs)
- [OpenRouter Documentation](https://openrouter.ai/docs)
- [Bun Documentation](https://bun.sh/docs)