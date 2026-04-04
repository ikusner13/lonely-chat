import * as Cause from "effect/Cause";
import type * as Config from "effect/Config";
import type * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Layer from "effect/Layer";
import * as ManagedRuntime from "effect/ManagedRuntime";
import { error } from "@sveltejs/kit";

import type { AiClient } from "../../ai/Services/ai-client";
import { OpenRouterAiClientLive } from "../../ai/Layers/openrouter-ai-client";
import { BotServiceLive } from "../../bots/Layers/bot-service";
import type { BotService } from "../../bots/Services/bot-service";
import { getDatabasePath, makeDatabaseLayer } from "../../db/database";
import { PlatformAdapterLive } from "../../platforms/Layers/platform-adapter";
import { ScenarioServiceLive } from "../../scenarios/Layers/scenario-service";
import type { ScenarioService } from "../../scenarios/Services/scenario-service";
import { SessionServiceLive } from "../../sessions/Layers/session-service";
import type { SessionService } from "../../sessions/Services/session-service";

export type AppServices = AiClient | BotService | ScenarioService | SessionService;

const internalServerError = 500;

const makeAppRuntime = (
  dbPath: string,
  aiLayer: Layer.Layer<AiClient, Config.ConfigError> = OpenRouterAiClientLive,
): ManagedRuntime.ManagedRuntime<AppServices, unknown> => {
  const databaseLayer = makeDatabaseLayer(dbPath);
  const botServiceLayer = BotServiceLive.pipe(Layer.provide(databaseLayer));
  const platformAdapterLayer = PlatformAdapterLive.pipe(Layer.provide(botServiceLayer));
  const scenarioServiceLayer = ScenarioServiceLive.pipe(Layer.provide(databaseLayer));
  const sessionServiceDependencies = Layer.mergeAll(
    databaseLayer,
    aiLayer,
    botServiceLayer,
    platformAdapterLayer,
    scenarioServiceLayer,
  );
  const sessionServiceLayer = SessionServiceLive.pipe(Layer.provide(sessionServiceDependencies));

  return ManagedRuntime.make(
    Layer.mergeAll(aiLayer, botServiceLayer, scenarioServiceLayer, sessionServiceLayer),
  );
};

export const runtime = makeAppRuntime(getDatabasePath());

const serializeUnknown = (value: unknown): unknown => {
  if (value instanceof Error) {
    return {
      cause: value.cause === undefined ? undefined : serializeUnknown(value.cause),
      message: value.message,
      name: value.name,
      stack: value.stack,
    };
  }

  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    value === null ||
    value === undefined
  ) {
    return value;
  }

  try {
    return structuredClone(value);
  } catch {
    return `${typeof value}: [unserializable]`;
  }
};

export const effectRunner = async <T>(
  effect: Effect.Effect<T, unknown, AppServices>,
): Promise<T> => {
  const exit = await runtime.runPromiseExit(effect);

  if (Exit.isFailure(exit)) {
    const { cause } = exit;

    for (const reason of cause.reasons) {
      if (Cause.isFailReason(reason)) {
        console.error("Effect error", { error: serializeUnknown(reason.error) });
      } else if (Cause.isDieReason(reason)) {
        console.error("Effect defect", { defect: serializeUnknown(reason.defect) });
      } else if (Cause.isInterruptReason(reason)) {
        console.error("Effect interrupted", { fiberId: reason.fiberId });
      }
    }

    error(internalServerError, { message: "Internal server error" });
  }

  return exit.value;
};
