import type { Effect } from "effect";
import { ServiceMap } from "effect";
import type { SqlError } from "effect/unstable/sql/SqlError";

import type { ScenarioId, ScenarioRecord } from "../scenario-record";

export interface ScenarioServiceShape {
  readonly createScenario: (scenario: ScenarioRecord) => Effect.Effect<ScenarioRecord, SqlError>;
  readonly deleteScenario: (id: ScenarioId) => Effect.Effect<void, SqlError>;
  readonly getScenario: (id: ScenarioId) => Effect.Effect<ScenarioRecord | null, SqlError>;
  readonly listScenarios: () => Effect.Effect<readonly ScenarioRecord[], SqlError>;
  readonly updateScenario: (
    scenario: ScenarioRecord,
  ) => Effect.Effect<ScenarioRecord | null, SqlError>;
}

export class ScenarioService extends ServiceMap.Service<ScenarioService, ScenarioServiceShape>()(
  "lonely-chat/scenarios/Services/ScenarioService",
) {}
