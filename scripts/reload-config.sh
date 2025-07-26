#!/usr/bin/env bash

# Reload config for Twitch bot

# Check if we're inside a Docker container
if [ -f /.dockerenv ]; then
    echo "❌ Cannot reload from inside container"
    echo "Run this script from the host machine"
    exit 1
fi

# Check if docker compose is available
if ! command -v docker &> /dev/null; then
    echo "❌ Docker not found"
    echo "This script is for Docker deployments only"
    exit 1
fi

# Check if the bot container is running
if docker compose ps 2>/dev/null | grep -q "twitch-bot.*running"; then
    echo "🔄 Reloading configuration..."
    docker compose kill -s HUP twitch-bot
    
    if [ $? -eq 0 ]; then
        echo "✅ Reload signal sent successfully"
        echo ""
        echo "📋 Check logs with:"
        echo "   docker compose logs -f twitch-bot | grep -i config"
    else
        echo "❌ Failed to send reload signal"
        exit 1
    fi
else
    echo "❌ Bot container is not running"
    echo ""
    echo "Start the bot with:"
    echo "   docker compose up -d"
    exit 1
fi