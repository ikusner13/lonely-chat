# Twitch Moderation Bot Capabilities

## Overview
This document outlines all moderation actions available to an AI-powered Twitch moderation bot using the Twitch Helix API.

## Available Moderation Actions

### 1. User Management

#### Ban User
- **Endpoint**: `POST https://api.twitch.tv/helix/moderation/bans`
- **Scope**: `moderator:manage:banned_users`
- **Parameters**:
  - `broadcaster_id`: Channel ID
  - `moderator_id`: Bot's user ID
  - Body: `{ "data": { "user_id": "123", "reason": "Violation reason" } }`
- **Description**: Permanently ban a user from the channel

#### Timeout User
- **Endpoint**: `POST https://api.twitch.tv/helix/moderation/bans`
- **Scope**: `moderator:manage:banned_users`
- **Parameters**:
  - Same as ban, but include `duration` in seconds
  - Body: `{ "data": { "user_id": "123", "duration": 600, "reason": "10 minute timeout" } }`
- **Description**: Temporarily prevent user from chatting (1 second to 1,209,600 seconds/14 days)

#### Unban User
- **Endpoint**: `DELETE https://api.twitch.tv/helix/moderation/bans`
- **Scope**: `moderator:manage:banned_users`
- **Parameters**:
  - `broadcaster_id`, `moderator_id`, `user_id`
- **Description**: Remove a ban/timeout from a user

#### Warn User
- **Endpoint**: `POST https://api.twitch.tv/helix/moderation/warnings`
- **Scope**: `moderator:manage:warnings`
- **Parameters**:
  - `broadcaster_id`, `moderator_id`
  - Body: `{ "data": { "user_id": "123", "reason": "Warning message" } }`
- **Description**: Send an official warning to a user

### 2. Message Management

#### Delete Chat Messages
- **Endpoint**: `DELETE https://api.twitch.tv/helix/moderation/chat`
- **Scope**: `moderator:manage:chat_messages`
- **Parameters**:
  - `broadcaster_id`, `moderator_id`
  - `message_id`: Specific message to delete
- **Description**: Remove inappropriate messages from chat

### 3. Chat Settings Control

#### Update Chat Settings
- **Endpoint**: `PATCH https://api.twitch.tv/helix/chat/settings`
- **Scope**: `moderator:manage:chat_settings`
- **Parameters**:
  - `broadcaster_id`, `moderator_id`
  - Body options:
    - `emote_mode`: Boolean - Emote-only mode
    - `follower_mode`: Boolean - Followers-only mode
    - `follower_mode_duration`: Minutes user must follow before chatting
    - `slow_mode`: Boolean - Slow mode enabled
    - `slow_mode_wait_time`: Seconds between messages (1-120)
    - `subscriber_mode`: Boolean - Subscriber-only mode
    - `unique_chat_mode`: Boolean - Prevents duplicate messages
- **Description**: Dynamically adjust chat restrictions

#### Activate Shield Mode
- **Endpoint**: `PUT https://api.twitch.tv/helix/moderation/shield_mode`
- **Scope**: `moderator:manage:shield_mode`
- **Parameters**:
  - `broadcaster_id`, `moderator_id`
  - Body: `{ "is_active": true }`
- **Description**: Emergency protection against harassment/raids

### 4. AutoMod Management

#### Update AutoMod Settings
- **Endpoint**: `PUT https://api.twitch.tv/helix/moderation/automod/settings`
- **Scope**: `moderator:manage:automod_settings`
- **Parameters**:
  - `broadcaster_id`, `moderator_id`
  - Body: Severity levels (0-4) for:
    - `aggression`
    - `bullying`
    - `disability`
    - `misogyny`
    - `race_ethnicity_or_religion`
    - `sex_based_terms`
    - `sexuality_sex_or_gender`
    - `swearing`
- **Description**: Adjust automatic content filtering levels

#### Check AutoMod Status
- **Endpoint**: `POST https://api.twitch.tv/helix/moderation/enforcements/status`
- **Scope**: `moderator:read:automod_settings`
- **Parameters**:
  - Test messages against current AutoMod settings
- **Description**: Pre-check if content would be blocked

### 5. Blocked Terms Management

#### Add Blocked Term
- **Endpoint**: `POST https://api.twitch.tv/helix/moderation/blocked_terms`
- **Scope**: `moderator:manage:blocked_terms`
- **Parameters**:
  - `broadcaster_id`, `moderator_id`
  - Body: `{ "text": "blocked phrase" }`
- **Description**: Add custom words/phrases that trigger instant timeout

#### Remove Blocked Term
- **Endpoint**: `DELETE https://api.twitch.tv/helix/moderation/blocked_terms`
- **Scope**: `moderator:manage:blocked_terms`
- **Parameters**:
  - `broadcaster_id`, `moderator_id`, `id` (blocked term ID)
- **Description**: Remove blocked terms from the list

#### Get Blocked Terms
- **Endpoint**: `GET https://api.twitch.tv/helix/moderation/blocked_terms`
- **Scope**: `moderator:read:blocked_terms`
- **Description**: View current blocked terms list

### 6. Moderator/VIP Management

#### Add Moderator
- **Endpoint**: `POST https://api.twitch.tv/helix/moderation/moderators`
- **Scope**: `channel:manage:moderators`
- **Parameters**:
  - `broadcaster_id`, `user_id`
- **Description**: Grant moderator privileges to a user

#### Remove Moderator
- **Endpoint**: `DELETE https://api.twitch.tv/helix/moderation/moderators`
- **Scope**: `channel:manage:moderators`
- **Description**: Remove moderator privileges

#### Add/Remove VIP
- **Endpoints**: `POST/DELETE https://api.twitch.tv/helix/channels/vips`
- **Scope**: `channel:manage:vips`
- **Description**: Manage VIP status for users

## Example Bot Implementation

### Bot Personality: "GuardianBot"

**Character Traits:**
- Fair but firm enforcer
- Explains actions transparently
- Gives warnings before escalating
- Learns from patterns
- Professional yet approachable

### Example Interaction Flow

```
User123: "I hate all [slur] they should die"

GuardianBot's AI Analysis:
- Severity: High (hate speech + violence)
- User history: First offense
- Decision: 10-minute timeout + warning

Action taken:
1. Delete message
2. Timeout user for 600 seconds
3. Send warning: "@User123 has been timed out for 10 minutes. Hate speech and threats of violence are not tolerated. Please review our community guidelines."
4. Log incident for pattern analysis
```

### Progressive Enforcement System

1. **First Offense (Minor)**
   - Warning message
   - 1-minute timeout if repeated

2. **Second Offense or Moderate Violation**
   - Delete message
   - 5-10 minute timeout
   - Public warning

3. **Third Offense or Severe Violation**
   - 1-24 hour timeout
   - Consider permanent ban
   - Add terms to blocked list

4. **Extreme Violations (illegal content, doxxing, severe harassment)**
   - Immediate permanent ban
   - Activate shield mode if raid detected
   - Report to Twitch

### Smart Features

#### Pattern Recognition
```typescript
// Bot detects spam patterns
if (detectSpamPattern(messages)) {
  await updateChatSettings({ 
    slow_mode: true, 
    slow_mode_wait_time: 30 
  });
  await sendMessage("Slow mode activated due to spam detection.");
}
```

#### Contextual Understanding
```typescript
// Bot understands context
"User: This game is trash"
// Action: None (opinion about game)

"User: You're trash @streamer"
// Action: Warning for directed harassment
```

#### Raid Protection
```typescript
// Detect sudden influx of similar messages
if (detectRaid()) {
  await activateShieldMode({ is_active: true });
  await updateChatSettings({ 
    follower_mode: true,
    follower_mode_duration: 10 
  });
  await sendMessage("Shield mode activated. New followers must wait 10 minutes to chat.");
}
```

### Integration with AI

The bot uses Vercel AI SDK with tool calling:

```typescript
const response = await generateText({
  model: openrouter.chat('anthropic/claude-3-opus'),
  system: moderationSystemPrompt,
  messages: chatContext,
  tools: {
    timeout: timeoutTool,
    ban: banTool,
    deleteMessage: deleteMessageTool,
    warn: warnTool,
    updateChatSettings: updateChatSettingsTool,
    addBlockedTerm: addBlockedTermTool,
    activateShieldMode: activateShieldModeTool
  },
  toolChoice: 'auto'
});

// Execute the moderation actions chosen by AI
for (const toolCall of response.toolCalls) {
  await executeModerationAction(toolCall);
}
```

## Required OAuth Scopes

To function fully, the bot needs these scopes:
- `moderator:manage:banned_users`
- `moderator:manage:chat_messages`
- `moderator:manage:chat_settings`
- `moderator:manage:shield_mode`
- `moderator:manage:warnings`
- `moderator:manage:automod_settings`
- `moderator:read:automod_settings`
- `moderator:manage:blocked_terms`
- `moderator:read:blocked_terms`
- `channel:manage:moderators` (optional)
- `channel:manage:vips` (optional)

## Safety Measures

1. **Rate Limiting**: Prevent action spam
2. **Whitelist**: Never moderate channel owner, other bots, or designated VIPs
3. **Action Logging**: Track all moderation decisions
4. **Human Override**: Allow moderators to reverse bot decisions
5. **Escalation Limits**: Require human approval for permanent bans
6. **Context Window**: Consider user's recent history before acting