# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

goal: twitch bots to solve loneliness

- have bots, each with their own personality
- based on a conversation starter, the bots will
  have an autonoumous convo. for now have hard coded
  topic

## Key Technologies

- **Runtime**: Bun
- **Web Framework**: Hono v4.8.5
- **Language**: TypeScript
- **JSX**: Configured for Hono's JSX support

## Essential Commands

### Development

```bash
# Install dependencies
bun install

# Run development server with hot reload
bun run dev
```

The development server runs on http://localhost:3000

### Testing, Linting, and Building

Currently, no test, lint, or build commands are configured. Bun executes TypeScript files directly without a build step.

## Project Structure

The application has a minimal structure:

- `/src/index.ts` - Main application entry point containing the Hono server setup
- `/tsconfig.json` - TypeScript configuration with strict mode and Hono JSX support
- `/package.json` - Project dependencies and scripts

## Architecture Notes

This is a lightweight web application using Hono, a minimal web framework. The current implementation consists of a single endpoint that returns "Hello Hono!" at the root path.

When extending this application:

- Hono uses a Express-like API for defining routes
- TypeScript strict mode is enabled, ensure all types are properly defined
- JSX is configured to use Hono's JSX runtime for server-side rendering if needed
