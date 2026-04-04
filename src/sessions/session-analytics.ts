import { Schema } from "effect";

import { BotId } from "../bots/bot-record";
import { PlatformName } from "../platforms/Services/platform-adapter";

export class AnalyticsOverview extends Schema.Class("AnalyticsOverview")({
  totalCostUsd: Schema.Number,
  totalMessages: Schema.Number,
  totalSessions: Schema.Number,
  totalTokensUsed: Schema.Number,
}) {}

export class AnalyticsBotSummary extends Schema.Class("AnalyticsBotSummary")({
  botId: BotId,
  botName: Schema.String,
  displayName: Schema.String,
  messageCount: Schema.Number,
  platform: PlatformName,
  sessionCount: Schema.Number,
  totalTokensUsed: Schema.Number,
}) {}
