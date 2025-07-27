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

### Prerequisites
- [Bun](https://bun.sh) runtime installed
- Twitch application credentials ([create one here](https://dev.twitch.tv/console/apps))
- OpenRouter API key ([get one here](https://openrouter.ai))

### Installation

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

2. **Configure bots in `config/bots.toml`**:
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

```bash
# Start the auth dashboard
bun run auth

# Visit http://localhost:8080
# Generate tokens for:
# - Your channel (for stream monitoring)
# - Each bot account
# - Moderator bots (if needed)
```

### Run the Service

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

### Live Configuration Updates

```bash
# Edit your bot config
nano config/bots.toml

# Apply changes (Docker)
docker compose kill -s HUP lonely-chat

# Or for local development
kill -HUP $(pgrep -f "bun.*src/index.ts")
```

### Docker Deployment

```bash
# Build images
bun run docker:build

# Start services
bun run docker:up

# View logs
bun run docker:logs

# Access container
bun run docker:shell
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

### Debug Mode

Enable detailed logging:
```bash
LOG_LEVEL=debug bun run dev
```

## 📚 Resources

- [Twitch Developer Documentation](https://dev.twitch.tv/docs)
- [OpenRouter Documentation](https://openrouter.ai/docs)
- [Bun Documentation](https://bun.sh/docs)