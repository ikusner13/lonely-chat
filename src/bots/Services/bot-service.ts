import type { Effect } from "effect";
import { ServiceMap } from "effect";
import type { SqlError } from "effect/unstable/sql/SqlError";

import type { BotId, BotRecord } from "../bot-record";

export interface BotServiceShape {
  readonly createBot: (bot: BotRecord) => Effect.Effect<BotRecord, SqlError>;
  readonly getBot: (id: BotId) => Effect.Effect<BotRecord | null, SqlError>;
  readonly listBots: () => Effect.Effect<readonly BotRecord[], SqlError>;
  readonly updateBot: (bot: BotRecord) => Effect.Effect<BotRecord | null, SqlError>;
}

export class BotService extends ServiceMap.Service<BotService, BotServiceShape>()(
  "lonely-chat/bots/Services/BotService",
) {}
