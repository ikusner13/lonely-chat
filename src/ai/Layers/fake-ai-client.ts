import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Ref from "effect/Ref";
import { LanguageModel, Prompt, Response } from "effect/unstable/ai";

import { AiGenerationError } from "../ai-generation-error";
import { AiClient } from "../Services/ai-client";
import type { AiClientShape, AiGenerateRequest } from "../Services/ai-client";

export interface FakeAiClientShape {
  readonly aiClient: AiClientShape;
  readonly getRequests: Effect.Effect<readonly AiGenerateRequest[]>;
}

const normalizeContent = (content: string): string => content.trim().replaceAll(/\s+/gu, " ");

const extractMessageText = (message: Prompt.Message): string => {
  if (typeof message.content === "string") {
    return normalizeContent(message.content);
  }

  return normalizeContent(
    message.content
      .filter((part): part is Prompt.TextPart => part.type === "text")
      .map((part) => part.text)
      .join(" "),
  );
};

const summarizePrompt = (prompt: Prompt.Prompt): string => {
  const reversedMessages = prompt.content.toReversed();
  const latestUserMessage = reversedMessages.find(
    (message) => message.role === "user" && extractMessageText(message).length > 0,
  );
  const fallbackMessage = reversedMessages.find(
    (message) => extractMessageText(message).length > 0,
  );

  if (latestUserMessage !== undefined) {
    return extractMessageText(latestUserMessage);
  }

  if (fallbackMessage !== undefined) {
    return extractMessageText(fallbackMessage);
  }

  return "...";
};

const makeUsage = (promptText: string, responseText: string): Response.Usage =>
  new Response.Usage({
    inputTokens: {
      cacheRead: undefined,
      cacheWrite: undefined,
      total: promptText.length,
      uncached: promptText.length,
    },
    outputTokens: {
      reasoning: undefined,
      text: responseText.length,
      total: responseText.length,
    },
  });

const makeFakeResponse = (
  request: AiGenerateRequest,
): LanguageModel.GenerateTextResponse<Record<string, never>> => {
  const prompt = Prompt.make(request.messages);
  const promptText = summarizePrompt(prompt);
  const responseText = `[fake:${request.model}] ${promptText}`;

  return new LanguageModel.GenerateTextResponse([
    Response.makePart("text", {
      text: responseText,
    }),
    Response.makePart("finish", {
      reason: "stop",
      response: undefined,
      usage: makeUsage(promptText, responseText),
    }),
  ]);
};

export const makeFakeAiClient = Effect.gen(function* makeFakeAiClient() {
  const requestsRef = yield* Ref.make<readonly AiGenerateRequest[]>([]);

  const generateText = Effect.fn("AiClient.generateText")(function* generateFakeClientText(
    request: AiGenerateRequest,
  ) {
    yield* Ref.update(requestsRef, (requests) => [...requests, request]);

    const response = yield* Effect.try({
      catch: (cause) =>
        new AiGenerationError({
          botName: request.botName,
          cause,
          model: request.model,
        }),
      try: () => makeFakeResponse(request),
    });

    return {
      costUsd: 0,
      model: request.model,
      text: `${request.botName}: ${response.text}`,
      tokensUsed:
        (response.usage.inputTokens.total ?? 0) + (response.usage.outputTokens.total ?? 0),
    };
  });

  return {
    aiClient: {
      generateText,
    },
    getRequests: Ref.get(requestsRef),
  } satisfies FakeAiClientShape;
});

export const FakeAiClientLive = Layer.effect(
  AiClient,
  makeFakeAiClient.pipe(Effect.map(({ aiClient }) => AiClient.of(aiClient))),
);
