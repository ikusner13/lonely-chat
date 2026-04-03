# UI

## Tech

- **Svelte 5** (SvelteKit) with runes
- **Tailwind CSS** for styling
- **Effect RPC client** for API calls
- **WebSocket** for real-time chat feed + status updates

## Pages

### Dashboard (/)

The main control surface. Shows at a glance:

- **Session status**: active/idle, duration, platform, channel
- **Start/Stop controls**: manual session management
- **Active bots**: list with online/offline indicators, message count this session
- **Cost tracker**: current session spend, time elapsed, progress toward limits
- **Alert banner**: warnings at 50%, 75%, 90% of cost/time limits

### Chat Viewer (/chat)

Live view of all chat activity:

- Real-time message feed via WebSocket
- Each bot's messages color-coded by identity
- Timestamps and platform indicators
- Bot vs. external message distinction (if any real messages appear)
- Scrollback through session history
- **Export button**: download session as CSV or JSON

### Bot Manager (/bots)

CRUD for bot configurations:

- **Bot list**: all configured bots with platform, model, enabled toggle
- **Bot editor**: form for all personality schema fields
  - Structured fields (personality traits, vocabulary rules, response length range, talkativeness slider)
  - Example messages editor (add/remove/reorder)
  - System prompt override (advanced, hidden by default)
  - Model + temperature + token limit controls
  - Platform selection + OAuth connection status
- **Bot preview**: test a bot's voice by sending a sample prompt and seeing the response
- **Duplicate bot**: clone an existing bot's config as a starting point

### Scenarios (/scenarios)

Manage predefined chat sequences:

- **Scenario list**: saved scenarios with description, bot count, estimated duration
- **Scenario editor**:
  - Name + description
  - Topic/theme (injected into bot context)
  - Participating bots (select from configured bots)
  - Trigger conditions (manual, timed, on-event)
  - Sequence steps (optional — for scripted beats within the scenario)
- **Run scenario**: trigger a scenario during an active session

### Auth (/auth)

Platform OAuth management:

- **Per-bot token status**: valid, expired, missing
- **Re-authorize button**: kicks off OAuth flow for a specific bot
- **Bulk operations**: refresh all tokens, check all statuses

### Analytics (/analytics)

Session history and stats:

- **Session log**: list of past sessions with duration, message count, cost
- **Per-bot stats**: messages sent, avg response time, most-used phrases
- **Cost history**: spend over time, per-session breakdown
- **Export**: CSV/JSON export of any view

## Real-Time Architecture

```
Server                          Client
  |                               |
  |-- Effect RPC stream --------->| (bot status, session events, cost updates)
  |                               |
  |-- WebSocket ----------------->| (chat messages, low-latency feed)
  |                               |
  |<-- Effect RPC calls ----------| (CRUD, start/stop, trigger scenario)
```

- **Effect RPC streaming** for structured data: session state changes, cost threshold alerts, bot status updates
- **WebSocket** for high-frequency chat messages (lower latency than RPC streaming for this use case)
- **Effect RPC requests** for all mutations and queries

## Design Notes

- Internal tool — functional over polished. Clean, not fancy
- Dark mode default (it's a streaming/testing tool)
- Responsive but desktop-first (nobody's using this on mobile)
- Toast notifications for cost alerts and errors
