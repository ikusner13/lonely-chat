import * as Config from "effect/Config";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import type * as Redacted from "effect/Redacted";
import { ServiceMap } from "effect";

export interface KickPlatformConfigShape {
  readonly clientId: string;
  readonly clientSecret: Redacted.Redacted;
  readonly redirectUri: string;
  readonly scopes: readonly string[];
}

const kickScopes = ["chat:write", "events:subscribe"] as const;

export class KickPlatformConfig extends ServiceMap.Service<
  KickPlatformConfig,
  KickPlatformConfigShape
>()("lonely-chat/platforms/Services/KickPlatformConfig") {
  static readonly layer = Layer.effect(
    KickPlatformConfig,
    Effect.gen(function* kickPlatformConfigLayer() {
      const clientId = yield* Config.string("KICK_CLIENT_ID");
      const clientSecret = yield* Config.redacted("KICK_CLIENT_SECRET");
      const redirectUri = yield* Config.string("KICK_REDIRECT_URI");

      return KickPlatformConfig.of({
        clientId,
        clientSecret,
        redirectUri,
        scopes: kickScopes,
      });
    }),
  );
}
