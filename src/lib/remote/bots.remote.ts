import * as Effect from "effect/Effect";
import { command, query } from "$app/server";

import { effectRunner } from "$lib/server/runtime";
import { makeBotPreviewRequest, parseBotPreviewInput } from "../../ai/bot-preview";
import { OpenRouterAiClientLive } from "../../ai/Layers/openrouter-ai-client";
import { AiClient } from "../../ai/Services/ai-client";
import { BotId } from "../../bots/bot-record";
import type { BotRecord } from "../../bots/bot-record";
import {
  BotEditorFormValues,
  makeBotRecordFromEditorFields,
  parseBotEditorFields,
} from "../../bots/bot-editor-fields";
import type { BotEditorFormErrors } from "../../bots/bot-editor-fields";
import { BotService } from "../../bots/Services/bot-service";

export const getBots = query(async () =>
  effectRunner(BotService.use((botService) => botService.listBots())),
);

interface SaveBotResult {
  readonly errors: BotEditorFormErrors;
  readonly ok: boolean;
}

interface BotEditorFormInput {
  readonly description: string;
  readonly displayName: string;
  readonly enabled: boolean;
  readonly exampleMessages: string;
  readonly fallbackModels: string;
  readonly firstMessage: string;
  readonly maxTokens: string;
  readonly model: string;
  readonly name: string;
  readonly personality: string;
  readonly platform: string;
  readonly postHistoryPrompt: string;
  readonly responseLengthMax: string;
  readonly responseLengthMin: string;
  readonly systemPrompt: string;
  readonly talkativeness: string;
  readonly temperature: string;
  readonly vocabularyRules: string;
}

export const createBot = command(
  "unchecked",
  async (values: BotEditorFormInput): Promise<SaveBotResult> => {
    const formValues = new BotEditorFormValues(values);
    const parsed = parseBotEditorFields(formValues);

    if (parsed.editorFields === null) {
      return { errors: parsed.errors, ok: false };
    }

    await effectRunner(
      BotService.use((botService) =>
        botService.createBot(
          makeBotRecordFromEditorFields(parsed.editorFields, new Date().toISOString()),
        ),
      ),
    );

    await getBots().refresh();
    return { errors: {}, ok: true };
  },
);

export const updateBot = command(
  "unchecked",
  async ({
    botId,
    values,
  }: {
    readonly botId: string;
    readonly values: BotEditorFormInput;
  }): Promise<SaveBotResult> => {
    const existingBot = await effectRunner(
      BotService.use((botService) => botService.getBot(BotId.makeUnsafe(botId))),
    );

    if (existingBot === null) {
      return { errors: {}, ok: false };
    }

    const formValues = new BotEditorFormValues(values);
    const parsed = parseBotEditorFields(formValues);

    if (parsed.editorFields === null) {
      return { errors: parsed.errors, ok: false };
    }

    await effectRunner(
      BotService.use((botService) =>
        botService.updateBot(
          makeBotRecordFromEditorFields(parsed.editorFields, new Date().toISOString(), existingBot),
        ),
      ),
    );

    await getBots().refresh();
    return { errors: {}, ok: true };
  },
);

export { type BotRecord, type BotEditorFormErrors, type BotEditorFormInput };

export const previewBot = command(
  "unchecked",
  async ({
    botId,
    prompt,
  }: {
    readonly botId: string;
    readonly prompt: string;
  }): Promise<{ error?: string; model?: string; prompt: string; response?: string }> => {
    const bot = await effectRunner(
      BotService.use((botService) => botService.getBot(BotId.makeUnsafe(botId))),
    );

    if (bot === null) {
      return { error: "Bot not found", prompt };
    }

    const parsed = parseBotPreviewInput(prompt);
    const previewInput = parsed.input;

    if (previewInput === null) {
      return { error: parsed.error ?? "Preview prompt is required.", prompt };
    }

    const preview = await effectRunner(
      AiClient.use((aiClient) =>
        aiClient.generateText(makeBotPreviewRequest(bot, previewInput)),
      ).pipe(Effect.provide(OpenRouterAiClientLive)),
    );

    return {
      model: preview.model,
      prompt,
      response: preview.text,
    };
  },
);
