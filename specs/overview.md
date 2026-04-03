# Overview

## What

Internal tool for simulating realistic chat activity during test streams. Multiple AI-powered bots join a stream's chat, talk to each other organically, and create the appearance of an active community — used when testing streamer product features with no real viewers present.

## Why

Our product serves streamers. Testing features (overlays, alerts, ad CTAs, chat triggers) requires active chat. Rather than manually typing test messages, Lonely Chat spins up a cast of AI characters that hold natural, orchestrated conversations.

## Goals

- **Realistic feel**: bots are aware of each other, hold multi-bot conversations, have distinct voices, use realistic typing delays
- **Platform-agnostic**: abstract adapter layer; ship Twitch + Kick at launch
- **Zero-config startup**: DB-backed configuration via web UI, no config files to manage
- **Cost-safe**: time limits, spend caps, threshold alerts so test sessions don't burn money
- **Internal & fun**: experimental tech stack, push boundaries, not customer-facing

## Non-Goals

- Not a production chatbot product
- Not a moderation tool (bots only chat, no mod actions)
- No real viewer interaction — this is pure simulation
- No YouTube support (200 msg/day API quota makes it impractical)

## Target Users

Internal team members testing stream features. Each person runs their own instance pointed at their own test channel.

## Constraints

- Single channel per instance (channel set via DB or env)
- Each bot requires its own platform account + OAuth tokens
- OpenRouter API costs scale with bot count and session length
