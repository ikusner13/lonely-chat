import { Schema } from "effect";

import { SessionId } from "../sessions/Services/session-service";
import { BotId } from "./bot-record";

export const BotMemoryId = Schema.String.pipe(Schema.brand("BotMemoryId"));
export type BotMemoryId = typeof BotMemoryId.Type;

export class BotMemoryRecord extends Schema.Class("BotMemoryRecord")({
  botId: BotId,
  createdAt: Schema.String,
  id: BotMemoryId,
  sessionId: SessionId,
  summary: Schema.String,
}) {}
