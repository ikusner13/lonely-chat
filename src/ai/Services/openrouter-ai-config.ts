import * as Config from "effect/Config";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import type * as Redacted from "effect/Redacted";
import { ServiceMap } from "effect";

export class OpenRouterAiConfig extends ServiceMap.Service<
  OpenRouterAiConfig,
  {
    readonly apiKey: Redacted.Redacted;
  }
>()("lonely-chat/ai/Services/OpenRouterAiConfig") {
  static readonly layer = Layer.effect(
    OpenRouterAiConfig,
    Effect.gen(function* openRouterAiConfigLayer() {
      const apiKey = yield* Config.redacted("OPENROUTER_API_KEY");

      return OpenRouterAiConfig.of({
        apiKey,
      });
    }),
  );
}
