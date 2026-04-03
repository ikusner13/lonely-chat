import * as Effect from "effect/Effect";
import { command, query } from "$app/server";

import { effectRunner } from "$lib/server/runtime";
import type { BotRecord } from "../../bots/bot-record";
import { BotService } from "../../bots/Services/bot-service";
import {
  ScenarioEditorFormValues,
  makeScenarioRecordFromEditorFields,
  parseScenarioEditorFields,
} from "../../scenarios/scenario-editor-fields";
import type { ScenarioEditorFormErrors } from "../../scenarios/scenario-editor-fields";
import { ScenarioId } from "../../scenarios/scenario-record";
import type { ScenarioRecord } from "../../scenarios/scenario-record";
import { ScenarioService } from "../../scenarios/Services/scenario-service";
import { SessionService } from "../../sessions/Services/session-service";

export const getScenarios = query(async () =>
  effectRunner(ScenarioService.use((s) => s.listScenarios())),
);

export const getScenarioPageData = query(async () => {
  const [scenarios, bots, activeSession] = await Promise.all([
    effectRunner(ScenarioService.use((s) => s.listScenarios())),
    effectRunner(BotService.use((s) => s.listBots())),
    effectRunner(SessionService.use((s) => s.getActiveSession())),
  ]);

  return { activeSession, bots, scenarios };
});

interface SaveScenarioResult {
  readonly errors: ScenarioEditorFormErrors;
  readonly ok: boolean;
}

interface ScenarioEditorFormInput {
  readonly description: string;
  readonly durationSeconds: string;
  readonly enabled: boolean;
  readonly name: string;
  readonly participants: readonly string[];
  readonly steps: string;
  readonly topic: string;
  readonly triggerDelaySeconds: string;
  readonly triggerEventType: string;
  readonly triggerType: string;
}

export const createScenario = command(
  "unchecked",
  async (values: ScenarioEditorFormInput): Promise<SaveScenarioResult> => {
    const formValues = new ScenarioEditorFormValues(values);
    const parsed = parseScenarioEditorFields(formValues);

    if (parsed.editorFields === null) {
      return { errors: parsed.errors, ok: false };
    }

    await effectRunner(
      ScenarioService.use((s) =>
        s.createScenario(
          makeScenarioRecordFromEditorFields(parsed.editorFields, new Date().toISOString()),
        ),
      ),
    );

    await getScenarioPageData().refresh();
    return { errors: {}, ok: true };
  },
);

export const updateScenario = command(
  "unchecked",
  async ({
    scenarioId,
    values,
  }: {
    readonly scenarioId: string;
    readonly values: ScenarioEditorFormInput;
  }): Promise<SaveScenarioResult> => {
    const existing = await effectRunner(
      ScenarioService.use((s) => s.getScenario(ScenarioId.makeUnsafe(scenarioId))),
    );

    if (existing === null) {
      return { errors: {}, ok: false };
    }

    const formValues = new ScenarioEditorFormValues(values);
    const parsed = parseScenarioEditorFields(formValues);

    if (parsed.editorFields === null) {
      return { errors: parsed.errors, ok: false };
    }

    await effectRunner(
      ScenarioService.use((s) =>
        s.updateScenario(
          makeScenarioRecordFromEditorFields(
            parsed.editorFields,
            new Date().toISOString(),
            existing,
          ),
        ),
      ),
    );

    await getScenarioPageData().refresh();
    return { errors: {}, ok: true };
  },
);

export const deleteScenario = command("unchecked", async (scenarioId: string): Promise<void> => {
  await effectRunner(
    ScenarioService.use((s) => s.deleteScenario(ScenarioId.makeUnsafe(scenarioId))),
  );

  await getScenarioPageData().refresh();
});

export const runScenario = command("unchecked", async (scenarioId: string): Promise<void> => {
  await effectRunner(
    SessionService.use((s) => s.runScenario(ScenarioId.makeUnsafe(scenarioId))).pipe(
      Effect.catch(() => Effect.void),
    ),
  );
});

export {
  type BotRecord,
  type ScenarioRecord,
  type ScenarioEditorFormErrors,
  type ScenarioEditorFormInput,
};
