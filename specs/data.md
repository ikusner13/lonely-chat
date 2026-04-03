# Data

## Database

SQLite via `@effect/sql-sqlite-bun`. Single file, embedded, no server. DB path configurable via env var for Docker deployments.

## Schema

### bots

All bot configuration. Source of truth for the personality system.

| Column              | Type        | Notes                              |
| ------------------- | ----------- | ---------------------------------- |
| id                  | TEXT (uuid) | PK                                 |
| name                | TEXT        | platform username                  |
| display_name        | TEXT        | how other bots refer to them       |
| platform            | TEXT        | "twitch" \| "kick"                 |
| model               | TEXT        | OpenRouter model ID                |
| fallback_models     | TEXT (JSON) | ordered list of fallback model IDs |
| temperature         | REAL        | 0.0 - 2.0                          |
| max_tokens          | INTEGER     | response token limit               |
| personality         | TEXT        | trait summary                      |
| description         | TEXT        | background/backstory               |
| example_messages    | TEXT (JSON) | string[] of sample messages        |
| first_message       | TEXT        | nullable, intro message            |
| post_history_prompt | TEXT        | nullable, injected after history   |
| vocabulary_rules    | TEXT (JSON) | string[] of constraints            |
| response_length_min | INTEGER     | min words                          |
| response_length_max | INTEGER     | max words                          |
| talkativeness       | INTEGER     | 0-100                              |
| system_prompt       | TEXT        | nullable, full override            |
| enabled             | INTEGER     | 0 or 1                             |
| created_at          | TEXT (ISO)  |                                    |
| updated_at          | TEXT (ISO)  |                                    |

### bot_tokens

OAuth tokens per bot per platform.

| Column        | Type        | Notes                      |
| ------------- | ----------- | -------------------------- |
| id            | TEXT (uuid) | PK                         |
| bot_id        | TEXT        | FK -> bots.id              |
| platform      | TEXT        | "twitch" \| "kick"         |
| access_token  | TEXT        | encrypted at rest          |
| refresh_token | TEXT        | encrypted at rest          |
| scopes        | TEXT (JSON) | string[] of granted scopes |
| expires_at    | TEXT (ISO)  | token expiry               |
| created_at    | TEXT (ISO)  |                            |
| updated_at    | TEXT (ISO)  |                            |

### sessions

Track each test session.

| Column             | Type        | Notes                                                         |
| ------------------ | ----------- | ------------------------------------------------------------- |
| id                 | TEXT (uuid) | PK                                                            |
| platform           | TEXT        | which platform                                                |
| channel            | TEXT        | channel name                                                  |
| status             | TEXT        | "active" \| "ended" \| "timeout" \| "cost_limit"              |
| started_at         | TEXT (ISO)  |                                                               |
| ended_at           | TEXT (ISO)  | nullable                                                      |
| end_reason         | TEXT        | nullable: "manual", "stream_offline", "timeout", "cost_limit" |
| total_messages     | INTEGER     | count                                                         |
| total_tokens_used  | INTEGER     | OpenRouter tokens consumed                                    |
| total_cost_usd     | REAL        | estimated spend                                               |
| time_limit_seconds | INTEGER     | configured max duration                                       |
| cost_limit_usd     | REAL        | configured max spend                                          |

### session_messages

All chat messages within a session. Exportable.

| Column      | Type        | Notes                                             |
| ----------- | ----------- | ------------------------------------------------- |
| id          | TEXT (uuid) | PK                                                |
| session_id  | TEXT        | FK -> sessions.id                                 |
| bot_id      | TEXT        | nullable, FK -> bots.id (null = external message) |
| username    | TEXT        | display name of sender                            |
| content     | TEXT        | message text                                      |
| platform    | TEXT        |                                                   |
| is_bot      | INTEGER     | 0 or 1                                            |
| tokens_used | INTEGER     | nullable, tokens for this generation              |
| model_used  | TEXT        | nullable, which model generated this              |
| sent_at     | TEXT (ISO)  |                                                   |

### bot_memory

Persistent style memory across sessions.

| Column     | Type        | Notes                                           |
| ---------- | ----------- | ----------------------------------------------- |
| id         | TEXT (uuid) | PK                                              |
| bot_id     | TEXT        | FK -> bots.id                                   |
| session_id | TEXT        | FK -> sessions.id (which session produced this) |
| summary    | TEXT        | AI-generated session style summary              |
| created_at | TEXT (ISO)  |                                                 |

### scenarios

Predefined chat sequences.

| Column           | Type        | Notes                             |
| ---------------- | ----------- | --------------------------------- |
| id               | TEXT (uuid) | PK                                |
| name             | TEXT        |                                   |
| description      | TEXT        |                                   |
| topic            | TEXT        | theme injected into bot context   |
| participants     | TEXT (JSON) | botId[]                           |
| trigger_type     | TEXT        | "manual" \| "timed" \| "on_event" |
| trigger_config   | TEXT (JSON) | trigger-specific config           |
| steps            | TEXT (JSON) | Step[] — see scenarios spec       |
| duration_seconds | INTEGER     | nullable                          |
| enabled          | INTEGER     | 0 or 1                            |
| created_at       | TEXT (ISO)  |                                   |
| updated_at       | TEXT (ISO)  |                                   |

### settings

App-level configuration (single-row or key-value).

| Column     | Type        | Notes |
| ---------- | ----------- | ----- |
| key        | TEXT        | PK    |
| value      | TEXT (JSON) |       |
| updated_at | TEXT (ISO)  |       |

Settings include:

- `channel` — target channel name
- `channel_id` — platform channel ID
- `default_time_limit` — default session time limit
- `default_cost_limit` — default session cost limit
- `alert_thresholds` — [50, 75, 90] percent

## Cost Tracking

- Each AI generation logs `tokens_used` and `model_used` on the message
- OpenRouter returns token counts + cost in response headers
- Session aggregates total tokens and estimated USD cost
- Cost checked after each generation against session limit
- Time checked on a periodic interval against session limit
- Alerts pushed to UI via Effect RPC stream at configured thresholds (50%, 75%, 90%)

## Exports

Session messages exportable as:

- **CSV**: timestamp, username, content, is_bot, model_used, tokens_used
- **JSON**: full message objects with all fields

Triggered from the UI, generated server-side, downloaded as file.
