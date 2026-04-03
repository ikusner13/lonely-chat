import { Schema } from "effect";

import { ChannelName, PlatformName } from "../platforms/Services/platform-adapter";
import { SessionEndReason, SessionId, SessionStatus } from "./Services/session-service";

export class SessionRecord extends Schema.Class<SessionRecord>(
  "lonely-chat/sessions/SessionRecord",
)({
  channel: ChannelName,
  costLimitUsd: Schema.NullOr(Schema.Number),
  endReason: Schema.NullOr(SessionEndReason),
  endedAt: Schema.NullOr(Schema.String),
  id: SessionId,
  platform: PlatformName,
  startedAt: Schema.String,
  status: SessionStatus,
  timeLimitSeconds: Schema.NullOr(Schema.Number),
  totalCostUsd: Schema.Number,
  totalMessages: Schema.Number,
  totalTokensUsed: Schema.Number,
}) {}
