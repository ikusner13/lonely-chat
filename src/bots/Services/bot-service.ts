import type { Effect } from "effect";
import { ServiceMap } from "effect";
import type { SqlError } from "effect/unstable/sql/SqlError";

import type { BotRecord } from "../bot-record";

export interface BotServiceShape {
  readonly createBot: (bot: BotRecord) => Effect.Effect<BotRecord, SqlError>;
  readonly listBots: () => Effect.Effect<readonly BotRecord[], SqlError>;
}

export class BotService extends ServiceMap.Service<BotService, BotServiceShape>()(
  "lonely-chat/bots/Services/BotService",
) {}
