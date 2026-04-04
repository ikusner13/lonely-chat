import { describe, expect, it } from "@effect/vitest";

import {
  decodeDirectorEvaluation,
  makeDirectorDirective,
  shouldEvaluateDirector,
} from "./director";

describe("director orchestration", () => {
  it("evaluates when the message-count trigger is reached", () => {
    expect(
      shouldEvaluateDirector({
        lastEvaluatedAt: null,
        messagesSinceLastEvaluation: 15,
        now: Date.UTC(2026, 3, 3, 0, 15, 0),
      }),
    ).toBe(true);
  });

  it("evaluates when two minutes have elapsed since the last run", () => {
    const lastEvaluatedAt = Date.UTC(2026, 3, 3, 0, 0, 0);

    expect(
      shouldEvaluateDirector({
        lastEvaluatedAt,
        messagesSinceLastEvaluation: 3,
        now: lastEvaluatedAt + 2 * 60 * 1000,
      }),
    ).toBe(true);
  });

  it("evaluates immediately when scenario topic injection is requested", () => {
    expect(
      shouldEvaluateDirector({
        lastEvaluatedAt: null,
        messagesSinceLastEvaluation: 0,
        now: Date.UTC(2026, 3, 3, 0, 0, 0),
        scenarioInjectionRequested: true,
      }),
    ).toBe(true);
  });

  it("decodes director JSON and turns stale topic-shift output into a directive", () => {
    const evaluation = decodeDirectorEvaluation(
      JSON.stringify({
        nudgeBot: "pixel",
        nudgeReason: "Pixel can revive the stream energy.",
        suggestedTopic: "co-op games",
        topicShift: true,
        vibe: "stale",
      }),
    );
    const directive = makeDirectorDirective(evaluation);

    expect(directive).not.toBeNull();
    expect(directive).toMatchObject({
      nudgedBotName: "pixel",
      talkativenessBoostPercent: 20,
    });
    expect(directive?.hint).toContain("co-op games");
  });
});
