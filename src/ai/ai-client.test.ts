import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";

import { makeFakeAiClient } from "./Layers/fake-ai-client";
import { AiModelName, BotName } from "./Services/ai-client";

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

      expect(response).toEqual({
        model: AiModelName.makeUnsafe("fake-model"),
        text: "Gene: [fake:fake-model] latest prompt",
      });
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
