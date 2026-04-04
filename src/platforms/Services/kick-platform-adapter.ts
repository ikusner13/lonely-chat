import type { Effect } from "effect";
import { Schema, ServiceMap } from "effect";

import type { BotTokenRecord } from "../../bots/bot-token-record";
import { BotId } from "../../bots/bot-record";

export class KickPlatformError extends Schema.TaggedErrorClass<KickPlatformError>()(
  "KickPlatformError",
  {
    cause: Schema.optional(Schema.Defect),
    reason: Schema.String,
  },
) {}

export class KickAuthorizationUrlRequest extends Schema.Class("KickAuthorizationUrlRequest")({
  botId: BotId,
  codeChallenge: Schema.NonEmptyString,
  state: Schema.NonEmptyString,
}) {}

export class KickAuthorizationCallbackRequest extends Schema.Class(
  "KickAuthorizationCallbackRequest",
)({
  botId: BotId,
  code: Schema.NonEmptyString,
  codeVerifier: Schema.NonEmptyString,
}) {}

export class KickTestMessageRequest extends Schema.Class("KickTestMessageRequest")({
  botId: BotId,
  text: Schema.NonEmptyString,
}) {}

export interface KickPlatformAdapterShape {
  readonly completeAuthorization: (
    request: KickAuthorizationCallbackRequest,
  ) => Effect.Effect<BotTokenRecord, KickPlatformError>;
  readonly getAuthorizationUrl: (
    request: KickAuthorizationUrlRequest,
  ) => Effect.Effect<string, KickPlatformError>;
  readonly sendTestMessage: (
    request: KickTestMessageRequest,
  ) => Effect.Effect<BotTokenRecord, KickPlatformError>;
}

export class KickPlatformAdapter extends ServiceMap.Service<
  KickPlatformAdapter,
  KickPlatformAdapterShape
>()("lonely-chat/platforms/Services/KickPlatformAdapter") {}
