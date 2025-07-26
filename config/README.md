# Bot Configuration

This directory contains the bot configuration file.

## Setup

1. Copy the example configuration:
   ```bash
   cp bots.toml.example bots.toml
   ```

2. Edit `bots.toml` to customize your bots

## Configuration Format

Each bot is defined in a `[[bots]]` section with the following fields:

- `name` - The Twitch username of the bot
- `role` - Either "chatter" or "moderator"
- `model` - The AI model to use (from OpenRouter)
- `temperature` - Controls randomness (0.0 to 2.0)
- `maxTokens` - Maximum response length
- `systemPrompt` - The bot's personality and instructions
- `introMessage` - Optional message when bot joins chat
- `fallbackModels` - Optional array of backup models

## Hot Reload

Changes to `bots.toml` are automatically detected and applied without restarting the application.

## Docker

When running in Docker, the config directory is mounted as a volume, allowing you to edit bots without rebuilding the container.