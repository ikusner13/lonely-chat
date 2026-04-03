import { Schema } from "effect";

import { BotId, ChatUsername, PlatformName } from "../platforms/Services/platform-adapter";
import { SessionId } from "./Services/session-service";

export const SessionMessageId = Schema.String.pipe(Schema.brand("SessionMessageId"));
export type SessionMessageId = typeof SessionMessageId.Type;

export class SessionMessageRecord extends Schema.Class<SessionMessageRecord>(
  "lonely-chat/sessions/SessionMessageRecord",
)({
  botId: Schema.NullOr(BotId),
  content: Schema.String,
  id: SessionMessageId,
  isBot: Schema.Boolean,
  modelUsed: Schema.NullOr(Schema.String),
  platform: PlatformName,
  sentAt: Schema.String,
  sessionId: SessionId,
  tokensUsed: Schema.NullOr(Schema.Number),
  username: ChatUsername,
}) {}
