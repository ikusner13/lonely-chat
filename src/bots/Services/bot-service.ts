import type { Effect } from "effect";
import { ServiceMap } from "effect";
import type { SqlError } from "effect/unstable/sql/SqlError";

import type { BotAuthStatusRecord, BotTokenRecord } from "../bot-token-record";
import type { BotMemoryRecord } from "../bot-memory-record";
import type { BotId, BotRecord } from "../bot-record";

export interface BotServiceShape {
  readonly createBot: (bot: BotRecord) => Effect.Effect<BotRecord, SqlError>;
  readonly createBotMemory: (memory: BotMemoryRecord) => Effect.Effect<BotMemoryRecord, SqlError>;
  readonly getBotAuthStatus: (
    botId: BotId,
    now: string,
  ) => Effect.Effect<BotAuthStatusRecord, SqlError>;
  readonly getBot: (id: BotId) => Effect.Effect<BotRecord | null, SqlError>;
  readonly getBotToken: (botId: BotId) => Effect.Effect<BotTokenRecord | null, SqlError>;
  readonly listBotMemories: (botId: BotId) => Effect.Effect<readonly BotMemoryRecord[], SqlError>;
  readonly listBots: () => Effect.Effect<readonly BotRecord[], SqlError>;
  readonly listBotsWithAuthStatus: (now: string) => Effect.Effect<
    readonly {
      readonly auth: BotAuthStatusRecord;
      readonly bot: BotRecord;
      readonly token: BotTokenRecord | null;
    }[],
    SqlError
  >;
  readonly upsertBotToken: (token: BotTokenRecord) => Effect.Effect<BotTokenRecord, SqlError>;
  readonly updateBot: (bot: BotRecord) => Effect.Effect<BotRecord | null, SqlError>;
}

export class BotService extends ServiceMap.Service<BotService, BotServiceShape>()(
  "lonely-chat/bots/Services/BotService",
) {}
