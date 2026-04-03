import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import {
  ScenarioId,
  ScenarioRecord,
  ScenarioStep,
  ScenarioTriggerConfig,
} from "../scenario-record";
import { ScenarioService } from "../Services/scenario-service";
import type { ScenarioServiceShape } from "../Services/scenario-service";

const decodeBotIdArray = Schema.decodeUnknownSync(
  Schema.Array(Schema.String.pipe(Schema.brand("BotId"))),
);
const decodeScenarioSteps = Schema.decodeUnknownSync(Schema.Array(ScenarioStep));
const decodeTriggerConfig = Schema.decodeUnknownSync(ScenarioTriggerConfig);

interface ScenarioRow {
  readonly created_at: string;
  readonly description: string;
  readonly duration_seconds: number | null;
  readonly enabled: number;
  readonly id: string;
  readonly name: string;
  readonly participants: string;
  readonly steps: string;
  readonly topic: string;
  readonly trigger_config: string;
  readonly trigger_type: "manual" | "timed" | "on_event";
  readonly updated_at: string;
}

const makeScenarioRecord = (row: ScenarioRow): ScenarioRecord =>
  new ScenarioRecord({
    createdAt: row.created_at,
    description: row.description,
    durationSeconds: row.duration_seconds,
    enabled: row.enabled === 1,
    id: ScenarioId.makeUnsafe(row.id),
    name: row.name,
    participants: decodeBotIdArray(JSON.parse(row.participants) as unknown),
    steps: decodeScenarioSteps(JSON.parse(row.steps) as unknown),
    topic: row.topic,
    triggerConfig: decodeTriggerConfig(JSON.parse(row.trigger_config) as unknown),
    triggerType: row.trigger_type,
    updatedAt: row.updated_at,
  });

const selectFirstScenario = (rows: readonly ScenarioRow[]): ScenarioRecord | null => {
  const [scenario] = rows;

  if (scenario === undefined) {
    return null;
  }

  return makeScenarioRecord(scenario);
};

export const ScenarioServiceLive = Layer.effect(
  ScenarioService,
  Effect.gen(function* makeScenarioService() {
    const sql = yield* SqlClient.SqlClient;

    const createScenario = Effect.fn("ScenarioService.createScenario")(
      function* createScenarioEffect(scenario: ScenarioRecord) {
        yield* sql`INSERT INTO scenarios (
            id,
            name,
            description,
            topic,
            participants,
            trigger_type,
            trigger_config,
            steps,
            duration_seconds,
            enabled,
            created_at,
            updated_at
          )
          VALUES (
            ${scenario.id},
            ${scenario.name},
            ${scenario.description},
            ${scenario.topic},
            ${JSON.stringify(scenario.participants)},
            ${scenario.triggerType},
            ${JSON.stringify(scenario.triggerConfig)},
            ${JSON.stringify(scenario.steps)},
            ${scenario.durationSeconds},
            ${scenario.enabled ? 1 : 0},
            ${scenario.createdAt},
            ${scenario.updatedAt}
          )`;

        return scenario;
      },
    );

    const getScenario = Effect.fn("ScenarioService.getScenario")(function* getScenarioEffect(
      id: ScenarioId,
    ) {
      const rows = yield* sql<ScenarioRow>`SELECT
            id,
            name,
            description,
            topic,
            participants,
            trigger_type,
            trigger_config,
            steps,
            duration_seconds,
            enabled,
            created_at,
            updated_at
          FROM scenarios
          WHERE id = ${id}
          LIMIT 1`;

      return selectFirstScenario(rows);
    });

    const listScenarios = Effect.fn("ScenarioService.listScenarios")(
      function* listScenariosEffect() {
        const rows = yield* sql<ScenarioRow>`SELECT
            id,
            name,
            description,
            topic,
            participants,
            trigger_type,
            trigger_config,
            steps,
            duration_seconds,
            enabled,
            created_at,
            updated_at
          FROM scenarios
          ORDER BY created_at ASC, name ASC`;

        return rows.map(makeScenarioRecord);
      },
    );

    const updateScenario = Effect.fn("ScenarioService.updateScenario")(
      function* updateScenarioEffect(scenario: ScenarioRecord) {
        yield* sql`UPDATE scenarios
          SET name = ${scenario.name},
              description = ${scenario.description},
              topic = ${scenario.topic},
              participants = ${JSON.stringify(scenario.participants)},
              trigger_type = ${scenario.triggerType},
              trigger_config = ${JSON.stringify(scenario.triggerConfig)},
              steps = ${JSON.stringify(scenario.steps)},
              duration_seconds = ${scenario.durationSeconds},
              enabled = ${scenario.enabled ? 1 : 0},
              updated_at = ${scenario.updatedAt}
          WHERE id = ${scenario.id}`;

        return yield* getScenario(scenario.id);
      },
    );

    const deleteScenario = Effect.fn("ScenarioService.deleteScenario")(
      function* deleteScenarioEffect(id: ScenarioId) {
        yield* sql`DELETE FROM scenarios WHERE id = ${id}`;
      },
    );

    return ScenarioService.of({
      createScenario,
      deleteScenario,
      getScenario,
      listScenarios,
      updateScenario,
    } satisfies ScenarioServiceShape);
  }),
);
