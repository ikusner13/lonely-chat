import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { BotId } from "../bots/bot-record";
import { makeDatabaseLayer } from "../db/database";
import { ScenarioServiceLive } from "./Layers/scenario-service";
import { ScenarioId, ScenarioRecord, ScenarioStep, ScenarioTriggerConfig } from "./scenario-record";
import { ScenarioService } from "./Services/scenario-service";

const createdAt = "2026-04-03T00:00:00.000Z";
const updatedAt = "2026-04-03T00:00:01.000Z";

interface StoredScenarioRow {
  readonly description: string;
  readonly duration_seconds: number | null;
  readonly enabled: number;
  readonly name: string;
  readonly participants: string;
  readonly steps: string;
  readonly topic: string;
  readonly trigger_config: string;
  readonly trigger_type: string;
  readonly updated_at: string;
}

const createDatabasePath = Effect.acquireRelease(
  Effect.promise(async () => {
    const directory = await mkdtemp(join(tmpdir(), "lonely-chat-scenario-"));

    return directory;
  }),
  (directory) =>
    Effect.promise(async () => {
      await rm(directory, {
        force: true,
        recursive: true,
      });
    }).pipe(Effect.orDie),
).pipe(Effect.map((directory) => join(directory, "lonely-chat.sqlite")));

const runWithDatabase = <Result, Error>(
  dbPath: string,
  effect: Effect.Effect<Result, Error, SqlClient.SqlClient>,
): Effect.Effect<Result, unknown> =>
  Effect.scoped(effect.pipe(Effect.provide(makeDatabaseLayer(dbPath))));

const loadStoredScenarios = (
  dbPath: string,
): Effect.Effect<readonly StoredScenarioRow[], unknown> =>
  runWithDatabase(
    dbPath,
    Effect.gen(function* queryStoredScenarios() {
      const sql = yield* SqlClient.SqlClient;

      return yield* sql<StoredScenarioRow>`SELECT
          name,
          description,
          topic,
          participants,
          trigger_type,
          trigger_config,
          steps,
          duration_seconds,
          enabled,
          updated_at
        FROM scenarios
        ORDER BY created_at ASC`;
    }),
  );

const makeTestScenario = (overrides?: Partial<ScenarioRecord>): ScenarioRecord =>
  new ScenarioRecord({
    createdAt,
    description: "Kick off a product CTA sequence.",
    durationSeconds: 45,
    enabled: true,
    id: ScenarioId.makeUnsafe("scenario-cta"),
    name: "Ad CTA Hype",
    participants: [BotId.makeUnsafe("bot-pixel"), BotId.makeUnsafe("bot-echo")],
    steps: [
      new ScenarioStep({
        action: "say",
        botId: BotId.makeUnsafe("bot-pixel"),
        content: "check out the product page",
        delayAfter: 3,
      }),
      new ScenarioStep({
        action: "respond",
        botId: BotId.makeUnsafe("bot-echo"),
        content: "react to the CTA naturally",
        delayAfter: 5,
      }),
    ],
    topic: "new merch drop",
    triggerConfig: new ScenarioTriggerConfig({
      delaySeconds: 12,
      eventType: null,
    }),
    triggerType: "timed",
    updatedAt,
    ...overrides,
  });

describe("scenario service", () => {
  it.effect("creates and lists persisted scenarios", () =>
    Effect.gen(function* createsAndListsPersistedScenarios() {
      const dbPath = yield* createDatabasePath;
      const scenarioLayer = ScenarioServiceLive.pipe(Layer.provide(makeDatabaseLayer(dbPath)));
      const scenario = makeTestScenario();

      const listedScenarios = yield* Effect.gen(function* exerciseScenarioCreate() {
        const scenarioService = yield* ScenarioService;

        expect(yield* scenarioService.createScenario(scenario)).toEqual(scenario);

        return yield* scenarioService.listScenarios();
      }).pipe(Effect.provide(scenarioLayer));

      expect(listedScenarios).toEqual([scenario]);
      expect(yield* loadStoredScenarios(dbPath)).toEqual([
        {
          description: "Kick off a product CTA sequence.",
          duration_seconds: 45,
          enabled: 1,
          name: "Ad CTA Hype",
          participants: JSON.stringify(["bot-pixel", "bot-echo"]),
          steps: JSON.stringify([
            {
              action: "say",
              botId: "bot-pixel",
              content: "check out the product page",
              delayAfter: 3,
            },
            {
              action: "respond",
              botId: "bot-echo",
              content: "react to the CTA naturally",
              delayAfter: 5,
            },
          ]),
          topic: "new merch drop",
          trigger_config: JSON.stringify({
            delaySeconds: 12,
            eventType: null,
          }),
          trigger_type: "timed",
          updated_at: updatedAt,
        },
      ]);
    }),
  );

  it.effect("updates and deletes persisted scenarios", () =>
    Effect.gen(function* updatesAndDeletesPersistedScenarios() {
      const dbPath = yield* createDatabasePath;
      const scenarioLayer = ScenarioServiceLive.pipe(Layer.provide(makeDatabaseLayer(dbPath)));
      const scenario = makeTestScenario();

      const updatedScenario = yield* Effect.gen(function* exerciseScenarioUpdate() {
        const scenarioService = yield* ScenarioService;

        yield* scenarioService.createScenario(scenario);

        const savedScenario = yield* scenarioService.updateScenario(
          makeTestScenario({
            createdAt: scenario.createdAt,
            description: "Stress-test a heated debate flow.",
            durationSeconds: null,
            enabled: false,
            id: scenario.id,
            name: "Heated Debate",
            participants: [BotId.makeUnsafe("bot-pixel"), BotId.makeUnsafe("bot-nova")],
            steps: [],
            topic: "controversial gaming opinion",
            triggerConfig: new ScenarioTriggerConfig({
              delaySeconds: null,
              eventType: "new_viewer_joined",
            }),
            triggerType: "on_event",
            updatedAt: "2026-04-03T00:00:02.000Z",
          }),
        );

        yield* scenarioService.deleteScenario(scenario.id);

        return savedScenario;
      }).pipe(Effect.provide(scenarioLayer));

      expect(updatedScenario).toEqual(
        expect.objectContaining({
          description: "Stress-test a heated debate flow.",
          durationSeconds: null,
          enabled: false,
          name: "Heated Debate",
          topic: "controversial gaming opinion",
          triggerType: "on_event",
        }),
      );
      expect(yield* loadStoredScenarios(dbPath)).toEqual([]);
    }),
  );
});
