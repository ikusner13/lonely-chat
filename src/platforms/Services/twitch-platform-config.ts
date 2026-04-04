import * as Config from "effect/Config";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import type * as Redacted from "effect/Redacted";
import { ServiceMap } from "effect";

export interface TwitchPlatformConfigShape {
  readonly clientId: string;
  readonly clientSecret: Redacted.Redacted;
  readonly redirectUri: string;
  readonly scopes: readonly string[];
}

const twitchScopes = ["chat:read", "chat:edit"] as const;

export class TwitchPlatformConfig extends ServiceMap.Service<
  TwitchPlatformConfig,
  TwitchPlatformConfigShape
>()("lonely-chat/platforms/Services/TwitchPlatformConfig") {
  static readonly layer = Layer.effect(
    TwitchPlatformConfig,
    Effect.gen(function* twitchPlatformConfigLayer() {
      const clientId = yield* Config.string("TWITCH_CLIENT_ID");
      const clientSecret = yield* Config.redacted("TWITCH_CLIENT_SECRET");
      const redirectUri = yield* Config.string("TWITCH_REDIRECT_URI");

      return TwitchPlatformConfig.of({
        clientId,
        clientSecret,
        redirectUri,
        scopes: twitchScopes,
      });
    }),
  );
}
