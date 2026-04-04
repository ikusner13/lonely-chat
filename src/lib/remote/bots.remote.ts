import * as Effect from "effect/Effect";
import { command, query } from "$app/server";

import { effectRunner } from "$lib/server/runtime";
import { BotTokenId, BotTokenRecord } from "../../bots/bot-token-record";
import { makeBotPreviewRequest, parseBotPreviewInput } from "../../ai/bot-preview";
import { OpenRouterAiClientLive } from "../../ai/Layers/openrouter-ai-client";
import { AiClient } from "../../ai/Services/ai-client";
import { BotId } from "../../bots/bot-record";
import type { BotRecord } from "../../bots/bot-record";
import type { BotAuthStatusRecord } from "../../bots/bot-token-record";
import {
  BotEditorFormValues,
  makeBotRecordFromEditorFields,
  parseBotEditorFields,
} from "../../bots/bot-editor-fields";
import type { BotEditorFormErrors } from "../../bots/bot-editor-fields";
import { BotService } from "../../bots/Services/bot-service";
import { KickPlatformAdapterLive } from "../../platforms/Layers/kick-platform-adapter";
import {
  KickPlatformAdapter,
  KickTestMessageRequest,
} from "../../platforms/Services/kick-platform-adapter";
import {
  TwitchPlatformAdapter,
  TwitchTestMessageRequest,
} from "../../platforms/Services/twitch-platform-adapter";
import { TwitchPlatformAdapterLive } from "../../platforms/Layers/twitch-platform-adapter";

export const getBots = query(async () =>
  effectRunner(BotService.use((botService) => botService.listBots())),
);

export const getBotManagerData = query(async () =>
  effectRunner(
    BotService.use((botService) => botService.listBotsWithAuthStatus(new Date().toISOString())),
  ),
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

interface SaveBotTokenResult {
  readonly errors: {
    accessToken?: string;
    expiresAt?: string;
    refreshToken?: string;
    scopes?: string;
  };
  readonly ok: boolean;
}

interface BotTokenFormInput {
  readonly accessToken: string;
  readonly expiresAt: string;
  readonly refreshToken: string;
  readonly scopes: string;
}

interface SendTwitchTestMessageResult {
  readonly errors: {
    channel?: string;
    general?: string;
    text?: string;
  };
  readonly ok: boolean;
}

interface TwitchTestMessageFormInput {
  readonly channel: string;
  readonly text: string;
}

interface SendKickTestMessageResult {
  readonly errors: {
    general?: string;
    text?: string;
  };
  readonly ok: boolean;
}

interface KickTestMessageFormInput {
  readonly text: string;
}

const trim = (value: string): string => value.trim();

const parseScopes = (value: string): readonly string[] =>
  value
    .split(/\r?\n/gu)
    .map(trim)
    .filter((scope) => scope.length > 0);

const isValidIsoTimestamp = (value: string): boolean => !Number.isNaN(Date.parse(value));

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

    await Promise.all([getBots().refresh(), getBotManagerData().refresh()]);
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

    await Promise.all([getBots().refresh(), getBotManagerData().refresh()]);
    return { errors: {}, ok: true };
  },
);

export const saveBotToken = command(
  "unchecked",
  async ({
    botId,
    values,
  }: {
    readonly botId: string;
    readonly values: BotTokenFormInput;
  }): Promise<SaveBotTokenResult> => {
    const bot = await effectRunner(
      BotService.use((botService) => botService.getBot(BotId.makeUnsafe(botId))),
    );

    if (bot === null) {
      return { errors: {}, ok: false };
    }

    const accessToken = trim(values.accessToken);
    const refreshToken = trim(values.refreshToken);
    const expiresAt = trim(values.expiresAt);
    const scopes = parseScopes(values.scopes);
    const errors: SaveBotTokenResult["errors"] = {};

    if (accessToken.length === 0) {
      errors.accessToken = "Access token is required.";
    }

    if (refreshToken.length === 0) {
      errors.refreshToken = "Refresh token is required.";
    }

    if (scopes.length === 0) {
      errors.scopes = "At least one scope is required.";
    }

    if (expiresAt.length === 0 || !isValidIsoTimestamp(expiresAt)) {
      errors.expiresAt = "Expires at must be a valid ISO timestamp.";
    }

    if (Object.keys(errors).length > 0) {
      return { errors, ok: false };
    }

    const existingToken = await effectRunner(
      BotService.use((botService) => botService.getBotToken(bot.id)),
    );
    const now = new Date().toISOString();

    await effectRunner(
      BotService.use((botService) =>
        botService.upsertBotToken(
          new BotTokenRecord({
            accessToken,
            botId: bot.id,
            createdAt: existingToken?.createdAt ?? now,
            expiresAt,
            id: existingToken?.id ?? BotTokenId.makeUnsafe(`token-${bot.id}`),
            platform: bot.platform,
            refreshToken,
            scopes,
            updatedAt: now,
          }),
        ),
      ),
    );

    await getBotManagerData().refresh();

    return { errors: {}, ok: true };
  },
);

export { type BotRecord, type BotEditorFormErrors, type BotEditorFormInput };
export { type BotAuthStatusRecord, type BotTokenFormInput, type BotTokenRecord };
export { type KickTestMessageFormInput, type TwitchTestMessageFormInput };

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

export const sendTwitchTestMessage = command(
  "unchecked",
  async ({
    botId,
    values,
  }: {
    readonly botId: string;
    readonly values: TwitchTestMessageFormInput;
  }): Promise<SendTwitchTestMessageResult> => {
    const channel = trim(values.channel);
    const text = trim(values.text);
    const errors: SendTwitchTestMessageResult["errors"] = {};

    if (channel.length === 0) {
      errors.channel = "Channel is required.";
    }

    if (text.length === 0) {
      errors.text = "Message text is required.";
    }

    if (Object.keys(errors).length > 0) {
      return { errors, ok: false };
    }

    const result = await effectRunner(
      TwitchPlatformAdapter.use((twitchPlatformAdapter) =>
        twitchPlatformAdapter
          .sendTestMessage(
            new TwitchTestMessageRequest({
              botId: BotId.makeUnsafe(botId),
              channel,
              text,
            }),
          )
          .pipe(
            Effect.as<SendTwitchTestMessageResult>({
              errors: {},
              ok: true,
            }),
            Effect.catchTag("TwitchPlatformError", (error) =>
              Effect.succeed({
                errors: { general: error.reason },
                ok: false,
              } satisfies SendTwitchTestMessageResult),
            ),
          ),
      ).pipe(Effect.provide(TwitchPlatformAdapterLive)),
    );

    await getBotManagerData().refresh();

    return result;
  },
);

export const sendKickTestMessage = command(
  "unchecked",
  async ({
    botId,
    values,
  }: {
    readonly botId: string;
    readonly values: KickTestMessageFormInput;
  }): Promise<SendKickTestMessageResult> => {
    const text = trim(values.text);
    const errors: SendKickTestMessageResult["errors"] = {};

    if (text.length === 0) {
      errors.text = "Message text is required.";
    }

    if (Object.keys(errors).length > 0) {
      return { errors, ok: false };
    }

    const result = await effectRunner(
      KickPlatformAdapter.use((kickPlatformAdapter) =>
        kickPlatformAdapter
          .sendTestMessage(
            new KickTestMessageRequest({
              botId: BotId.makeUnsafe(botId),
              text,
            }),
          )
          .pipe(
            Effect.as<SendKickTestMessageResult>({
              errors: {},
              ok: true,
            }),
            Effect.catchTag("KickPlatformError", (error) =>
              Effect.succeed({
                errors: { general: error.reason },
                ok: false,
              } satisfies SendKickTestMessageResult),
            ),
          ),
      ).pipe(Effect.provide(KickPlatformAdapterLive)),
    );

    await getBotManagerData().refresh();

    return result;
  },
);
