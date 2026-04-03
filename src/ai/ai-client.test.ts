import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Layer from "effect/Layer";
import * as HttpClient from "effect/unstable/http/HttpClient";
import * as HttpClientRequest from "effect/unstable/http/HttpClientRequest";
import * as HttpClientResponse from "effect/unstable/http/HttpClientResponse";
import { TestClock } from "effect/testing";

import { makeFakeAiClient } from "./Layers/fake-ai-client";
import { makeOpenRouterAiClient } from "./Layers/openrouter-ai-client";
import { AiGenerationError } from "./ai-generation-error";
import { AiGenerationSettings, AiModelName, BotName } from "./Services/ai-client";
import type { HttpClientRequest as HttpClientRequestType } from "effect/unstable/http/HttpClientRequest";

describe("fake ai client", () => {
  it.effect("returns a deterministic response from the latest user prompt", () =>
    Effect.gen(function* returnsADeterministicResponseFromTheLatestUserPrompt() {
      const fakeAiClient = yield* makeFakeAiClient;

      const response = yield* fakeAiClient.aiClient.generateText({
        botName: BotName.makeUnsafe("Gene"),
        messages: [
          {
            content: "You are Gene.",
            role: "system",
          },
          {
            content: "  first prompt  ",
            role: "user",
          },
          {
            content: "older reply",
            role: "assistant",
          },
          {
            content: " latest   prompt ",
            role: "user",
          },
        ],
        model: AiModelName.makeUnsafe("fake-model"),
      });

      expect(response).toMatchObject({
        costUsd: 0,
        model: AiModelName.makeUnsafe("fake-model"),
        text: "Gene: [fake:fake-model] latest prompt",
      });
      expect(response.tokensUsed).toBeGreaterThan(0);
    }),
  );

  it.effect("records requests for assertions in higher-level tests", () =>
    Effect.gen(function* recordsRequestsForAssertionsInHigherLevelTests() {
      const fakeAiClient = yield* makeFakeAiClient;

      yield* fakeAiClient.aiClient.generateText({
        botName: BotName.makeUnsafe("Gene"),
        messages: [
          {
            content: "Ping?",
            role: "user",
          },
        ],
        model: AiModelName.makeUnsafe("fake-model"),
      });

      expect(yield* fakeAiClient.getRequests).toEqual([
        {
          botName: BotName.makeUnsafe("Gene"),
          messages: [
            {
              content: "Ping?",
              role: "user",
            },
          ],
          model: AiModelName.makeUnsafe("fake-model"),
        },
      ]);
    }),
  );
});

const makeOpenRouterSuccessBody = (model: string, text: string) => ({
  choices: [
    {
      finish_reason: "stop",
      index: 0,
      message: {
        content: text,
        role: "assistant",
      },
    },
  ],
  created: 1,
  id: "chatcmpl-test",
  model,
  object: "chat.completion",
  usage: {
    completion_tokens: 5,
    prompt_tokens: 12,
    total_tokens: 17,
  },
});

interface RecordedRequest {
  readonly body: Record<string, unknown>;
  readonly headers: HttpClientRequestType["headers"];
  readonly url: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const readStringProperty = (value: Record<string, unknown>, key: string): string | null => {
  const property = value[key];

  return typeof property === "string" ? property : null;
};

const readWebRequestJson = (request: Request): Promise<unknown> => request.json();

const readRecordedRequest = (request: HttpClientRequestType): Effect.Effect<RecordedRequest> =>
  Effect.gen(function* readRecordedRequestEffect() {
    const webRequest = yield* HttpClientRequest.toWeb(request).pipe(Effect.orDie);
    const body = yield* Effect.promise(() => readWebRequestJson(webRequest)).pipe(Effect.orDie);

    if (!isRecord(body)) {
      return yield* Effect.die(new Error("Expected JSON object request body."));
    }

    return {
      body,
      headers: request.headers,
      url: request.url,
    };
  });

const makeMockJsonResponse = (options: {
  readonly status: number;
  readonly body: unknown;
  readonly headers?: Record<string, string>;
  readonly request: HttpClientRequestType;
}): HttpClientResponse.HttpClientResponse =>
  HttpClientResponse.fromWeb(
    options.request,
    Response.json(
      options.body,
      options.headers === undefined
        ? {
            status: options.status,
          }
        : {
            headers: options.headers,
            status: options.status,
          },
    ),
  );

const makeMockHttpClient = (
  handler: (request: HttpClientRequestType) => Effect.Effect<HttpClientResponse.HttpClientResponse>,
): HttpClient.HttpClient => HttpClient.make((request) => handler(request));

describe("OpenRouter ai client", () => {
  it.effect("builds a chat completion request from preview settings", () =>
    Effect.gen(function* buildsAChatCompletionRequestFromPreviewSettings() {
      let recordedRequest: RecordedRequest | undefined;

      const httpClient = makeMockHttpClient((request) =>
        Effect.gen(function* mockSuccessResponse() {
          recordedRequest = yield* readRecordedRequest(request);

          return makeMockJsonResponse({
            body: makeOpenRouterSuccessBody("openai/gpt-5-mini", "  clipped reply  "),
            headers: {
              "x-openrouter-cost": "0.00042",
            },
            request,
            status: 200,
          });
        }),
      );
      const aiClient = yield* makeOpenRouterAiClient({
        apiKey: "test-openrouter-key",
        baseURL: "https://openrouter.test/api/v1",
        httpClientLayer: Layer.succeed(HttpClient.HttpClient, httpClient),
      });

      const response = yield* aiClient.generateText({
        botName: BotName.makeUnsafe("Pixel"),
        messages: [
          {
            content: "You are Pixel.",
            role: "system",
          },
          {
            content: "[example] pixel_bot: clip it",
            role: "assistant",
          },
          {
            content: "why is chat screaming?",
            role: "user",
          },
        ],
        model: AiModelName.makeUnsafe("openai/gpt-5-mini"),
        settings: new AiGenerationSettings({
          fallbackModels: [AiModelName.makeUnsafe("openai/gpt-4.1-mini")],
          maxOutputTokens: 160,
          stopSequences: ["\n"],
          temperature: 0.7,
        }),
      });

      expect(response).toEqual({
        costUsd: 0.000_42,
        model: "openai/gpt-5-mini",
        text: "clipped reply",
        tokensUsed: 17,
      });
      expect(recordedRequest).toBeDefined();
      expect(recordedRequest?.body).toEqual({
        max_tokens: 160,
        messages: [
          {
            content: "You are Pixel.",
            role: "system",
          },
          {
            content: "[example] pixel_bot: clip it",
            role: "assistant",
          },
          {
            content: "why is chat screaming?",
            role: "user",
          },
        ],
        model: "openai/gpt-5-mini",
        stop: "\n",
        temperature: 0.7,
      });
      expect(recordedRequest?.headers["authorization"]).toBe("Bearer test-openrouter-key");
      expect(recordedRequest?.url).toBe("https://openrouter.test/api/v1/chat/completions");
    }),
  );

  it.effect(
    "falls back to the next configured model and surfaces an error when all models fail",
    () =>
      Effect.gen(function* fallsBackToTheNextConfiguredModelAndSurfacesAnErrorWhenAllModelsFail() {
        const attemptedModels: string[] = [];

        const httpClient = makeMockHttpClient((request) =>
          Effect.gen(function* mockFailureResponse() {
            const recordedRequest = yield* readRecordedRequest(request);
            const model = readStringProperty(recordedRequest.body, "model") ?? "unknown-model";

            attemptedModels.push(model);

            if (model === "openai/gpt-5-mini") {
              return makeMockJsonResponse({
                body: {
                  error: {
                    message: "primary model rate limited",
                  },
                },
                request,
                status: 429,
              });
            }

            return makeMockJsonResponse({
              body: {
                error: {
                  message: "fallback model unavailable",
                },
              },
              request,
              status: 503,
            });
          }),
        );
        const aiClient = yield* makeOpenRouterAiClient({
          apiKey: "test-openrouter-key",
          baseURL: "https://openrouter.test/api/v1",
          httpClientLayer: Layer.succeed(HttpClient.HttpClient, httpClient),
        });

        const request = {
          botName: BotName.makeUnsafe("Pixel"),
          messages: [
            {
              content: "You are Pixel.",
              role: "system" as const,
            },
            {
              content: "hello?",
              role: "user" as const,
            },
          ],
          model: AiModelName.makeUnsafe("openai/gpt-5-mini"),
          settings: new AiGenerationSettings({
            fallbackModels: [AiModelName.makeUnsafe("openai/gpt-4.1-mini")],
            maxOutputTokens: 160,
            stopSequences: ["\n"],
            temperature: 0.7,
          }),
        };

        const failureFiber = yield* aiClient
          .generateText(request)
          .pipe(Effect.flip, Effect.forkChild);

        yield* TestClock.adjust("1 second");
        yield* Effect.yieldNow;

        const failure = yield* Fiber.join(failureFiber);

        expect(attemptedModels).toEqual([
          "openai/gpt-5-mini",
          "openai/gpt-5-mini",
          "openai/gpt-4.1-mini",
        ]);
        expect(failure).toBeInstanceOf(AiGenerationError);
        expect(failure).toMatchObject({
          botName: "Pixel",
          model: "openai/gpt-4.1-mini",
        });
      }),
  );
});
