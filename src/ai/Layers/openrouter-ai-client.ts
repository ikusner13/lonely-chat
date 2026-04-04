import { OpenRouterClient } from "@effect/ai-openrouter";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Redacted from "effect/Redacted";
import * as Result from "effect/Result";
import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient";
import type * as HttpClient from "effect/unstable/http/HttpClient";
import type { Generated } from "@effect/ai-openrouter";

import { AiGenerationError } from "../ai-generation-error";
import { AiClient, AiModelName } from "../Services/ai-client";
import { OpenRouterAiConfig } from "../Services/openrouter-ai-config";
import type {
  AiClientShape,
  AiGenerateRequest,
  AiGenerateResponse,
  AiPromptMessage,
} from "../Services/ai-client";

interface OpenRouterAiClientOptions {
  readonly apiKey: string;
  readonly baseURL?: string;
  readonly httpClientLayer?: Layer.Layer<HttpClient.HttpClient>;
}

const toOpenRouterMessages = (
  messages: readonly AiPromptMessage[],
): readonly {
  readonly content: string;
  readonly role: "assistant" | "system" | "user";
}[] =>
  messages.map((message) => ({
    content: message.content,
    role: message.role,
  }));

const attemptModelsForRequest = (request: AiGenerateRequest): readonly string[] => [
  request.model,
  request.model,
  ...(request.settings?.fallbackModels ?? []),
];

type OpenRouterChatCompletionRequest = typeof Generated.ChatGenerationParams.Encoded;
type OpenRouterChatCompletionResponse = typeof Generated.SendChatCompletionRequest200.Type;
type OpenRouterAssistantContent = (typeof Generated.AssistantMessage.Type)["content"];

const extractTextFromChoice = (content: OpenRouterAssistantContent): string => {
  if (typeof content === "string") {
    return content.trim();
  }

  if (content === null || content === undefined) {
    return "";
  }

  return content
    .flatMap((part) => (part.type === "text" ? [part.text] : []))
    .join("")
    .trim();
};

const extractResponseText = (body: OpenRouterChatCompletionResponse): string => {
  const [choice] = body.choices;

  return choice === undefined ? "" : extractTextFromChoice(choice.message.content);
};

const parseCostUsd = (headers: Record<string, string>): number => {
  const headerEntries = Object.entries(headers).map(
    ([key, value]) => [key.toLowerCase(), value] as const,
  );
  const costHeader = headerEntries.find(
    ([key]) => key === "x-openrouter-cost" || key === "openrouter-cost" || key === "x-total-cost",
  );

  if (costHeader === undefined) {
    return 0;
  }

  const parsed = Number(costHeader[1]);

  return Number.isFinite(parsed) ? parsed : 0;
};

type OpenRouterClientService = typeof OpenRouterClient.OpenRouterClient.Service;

const makeAttempt = Effect.fnUntraced(function* makeAttemptEffect(
  client: OpenRouterClientService,
  request: AiGenerateRequest,
  model: string,
) {
  const stopSequence = request.settings?.stopSequences[0];
  const payload: OpenRouterChatCompletionRequest = {
    messages: toOpenRouterMessages(request.messages),
    ...(request.settings?.maxOutputTokens === undefined
      ? {}
      : { max_tokens: request.settings.maxOutputTokens }),
    model,
    ...(stopSequence === undefined ? {} : { stop: stopSequence }),
    ...(request.settings?.temperature === undefined
      ? {}
      : { temperature: request.settings.temperature }),
  };

  const [body, response] = yield* client.createChatCompletion(payload).pipe(
    Effect.mapError(
      (cause) =>
        new AiGenerationError({
          botName: request.botName,
          cause,
          model,
        }),
    ),
  );

  const headers = response.headers as Record<string, string>;

  return {
    costUsd: parseCostUsd(headers),
    model: AiModelName.makeUnsafe(body.model.trim()),
    text: extractResponseText(body),
    tokensUsed: body.usage?.total_tokens ?? 0,
  };
});

const generateWithFallback = Effect.fnUntraced(function* generateWithFallbackEffect(
  client: OpenRouterClientService,
  request: AiGenerateRequest,
  attemptModels: readonly string[],
): Effect.fn.Return<AiGenerateResponse, AiGenerationError> {
  const [currentModel, ...remainingModels] = attemptModels;

  if (currentModel === undefined) {
    return yield* Effect.fail(
      new AiGenerationError({
        botName: request.botName,
        cause: new Error("OpenRouter AI request did not include any models."),
        model: request.model,
      }),
    );
  }

  const attempt = yield* Effect.result(makeAttempt(client, request, currentModel));

  if (Result.isSuccess(attempt)) {
    return attempt.success;
  }

  if (remainingModels.length === 0) {
    return yield* Effect.fail(attempt.failure);
  }

  const [nextModel] = remainingModels;

  if (currentModel === request.model && nextModel === request.model) {
    yield* Effect.sleep(Duration.seconds(1));
  }

  return yield* generateWithFallback(client, request, remainingModels);
});

const makeAiClientShape = (client: OpenRouterClientService): AiClientShape => ({
  generateText: Effect.fn("AiClient.generateText")(function* generateOpenRouterText(
    request: AiGenerateRequest,
  ) {
    return yield* generateWithFallback(client, request, attemptModelsForRequest(request));
  }),
});

const makeOpenRouterClientLayer = (options: OpenRouterAiClientOptions) =>
  OpenRouterClient.layer({
    apiKey: Redacted.make(options.apiKey),
    apiUrl: options.baseURL,
  }).pipe(Layer.provide(options.httpClientLayer ?? FetchHttpClient.layer));

export const makeOpenRouterAiClient = (
  options: OpenRouterAiClientOptions,
): Effect.Effect<AiClientShape> =>
  Effect.gen(function* makeOpenRouterAiClientEffect() {
    const client = yield* OpenRouterClient.OpenRouterClient;

    return makeAiClientShape(client);
  }).pipe(Effect.provide(makeOpenRouterClientLayer(options)));

const OpenRouterClientLive = Layer.effect(
  OpenRouterClient.OpenRouterClient,
  Effect.gen(function* openRouterClientLayer() {
    const config = yield* OpenRouterAiConfig;

    return yield* OpenRouterClient.make({
      apiKey: config.apiKey,
    });
  }),
).pipe(Layer.provide(Layer.mergeAll(FetchHttpClient.layer, OpenRouterAiConfig.layer)));

const OpenRouterAiClientLayer = Layer.effect(
  AiClient,
  Effect.gen(function* openRouterAiClientLayer() {
    const client = yield* OpenRouterClient.OpenRouterClient;

    return AiClient.of(makeAiClientShape(client));
  }),
);

export const OpenRouterAiClientLive = OpenRouterAiClientLayer.pipe(
  Layer.provide(OpenRouterClientLive),
);
