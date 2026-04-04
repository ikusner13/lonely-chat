import type { Effect } from "effect";
import { Schema, ServiceMap } from "effect";

import type { BotTokenRecord } from "../../bots/bot-token-record";
import { BotId } from "../../bots/bot-record";

export class TwitchPlatformError extends Schema.TaggedErrorClass<TwitchPlatformError>()(
  "TwitchPlatformError",
  {
    cause: Schema.optional(Schema.Defect),
    reason: Schema.String,
  },
) {}

export class TwitchTestMessageRequest extends Schema.Class("TwitchTestMessageRequest")({
  botId: BotId,
  channel: Schema.NonEmptyString,
  text: Schema.NonEmptyString,
}) {}

export interface TwitchPlatformAdapterShape {
  readonly completeAuthorization: (
    botId: BotId,
    code: string,
  ) => Effect.Effect<BotTokenRecord, TwitchPlatformError>;
  readonly getAuthorizationUrl: (botId: BotId) => Effect.Effect<string, TwitchPlatformError>;
  readonly sendTestMessage: (
    request: TwitchTestMessageRequest,
  ) => Effect.Effect<BotTokenRecord, TwitchPlatformError>;
}

export class TwitchPlatformAdapter extends ServiceMap.Service<
  TwitchPlatformAdapter,
  TwitchPlatformAdapterShape
>()("lonely-chat/platforms/Services/TwitchPlatformAdapter") {}
