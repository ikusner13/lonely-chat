import { describe, expect, it } from "@effect/vitest";

import { BotId, BotRecord } from "../bots/bot-record";
import { BotId as PlatformBotId, ChatUsername } from "../platforms/Services/platform-adapter";
import { SessionId } from "../sessions/Services/session-service";
import { SessionMessageId, SessionMessageRecord } from "../sessions/session-message-record";
import {
  BotSpeakerState,
  calculateResponseDelay,
  makeMentionResponseRequest,
  selectSilenceBreaker,
  selectSpeakers,
} from "./mention-response";
import { DirectorDirective } from "./director";

const now = Date.UTC(2026, 3, 3, 0, 0, 0);

const makeBot = (overrides?: Partial<BotRecord>): BotRecord =>
  new BotRecord({
    createdAt: "2026-04-03T00:00:00.000Z",
    description: "test bot",
    displayName: "Pixel",
    enabled: true,
    exampleMessages: [],
    fallbackModels: [],
    firstMessage: null,
    id: BotId.makeUnsafe("bot-pixel"),
    maxTokens: 120,
    model: "openrouter/mock-model",
    name: "pixel",
    personality: "dry humor",
    platform: "twitch",
    postHistoryPrompt: null,
    responseLength: {
      max: 12,
      min: 3,
    },
    systemPrompt: null,
    talkativeness: 60,
    temperature: 0.8,
    updatedAt: "2026-04-03T00:00:00.000Z",
    vocabularyRules: [],
    ...overrides,
  });

const makeBotMessage = (bot: BotRecord, sentAt: string): SessionMessageRecord =>
  new SessionMessageRecord({
    botId: PlatformBotId.makeUnsafe(bot.id),
    content: `${bot.displayName} checks in`,
    id: SessionMessageId.makeUnsafe(`message-${bot.id}-${sentAt}`),
    isBot: true,
    modelUsed: null,
    platform: "mock",
    sentAt,
    sessionId: SessionId.makeUnsafe("session-1"),
    tokensUsed: null,
    username: ChatUsername.makeUnsafe(bot.name),
  });

const makeBotState = (bot: BotRecord, overrides?: Partial<BotSpeakerState>): BotSpeakerState =>
  new BotSpeakerState({
    botId: PlatformBotId.makeUnsafe(bot.id),
    consecutiveCount: 0,
    cooldownUntil: 0,
    lastSpokeAt: null,
    ...overrides,
  });

describe("speaker selection", () => {
  it("selects exact case-insensitive mentions and ignores partial mentions", () => {
    const pixel = makeBot();
    const echo = makeBot({
      displayName: "Echo",
      id: BotId.makeUnsafe("bot-echo"),
      name: "echo",
    });

    expect(
      selectSpeakers("hey @PiXeL and @pixelated", [pixel, echo]).map((speaker) => speaker.bot.id),
    ).toEqual([pixel.id]);
  });

  it("caps responders at three in priority order", () => {
    const pixel = makeBot();
    const echo = makeBot({
      displayName: "Echo",
      id: BotId.makeUnsafe("bot-echo"),
      name: "echo",
      talkativeness: 0,
    });
    const nova = makeBot({
      displayName: "Nova",
      id: BotId.makeUnsafe("bot-nova"),
      name: "nova",
      talkativeness: 0,
    });
    const luna = makeBot({
      displayName: "Luna",
      id: BotId.makeUnsafe("bot-luna"),
      name: "luna",
      talkativeness: 100,
    });

    expect(
      selectSpeakers("hey @pixel @echo @nova @luna", [pixel, echo, nova, luna]).map(
        (speaker) => speaker.bot.id,
      ),
    ).toEqual([pixel.id, echo.id, nova.id]);
  });

  it("filters bots that are on cooldown or already at the consecutive cap", () => {
    const pixel = makeBot();
    const echo = makeBot({
      displayName: "Echo",
      id: BotId.makeUnsafe("bot-echo"),
      name: "echo",
    });
    const nova = makeBot({
      displayName: "Nova",
      id: BotId.makeUnsafe("bot-nova"),
      name: "nova",
      talkativeness: 100,
    });

    expect(
      selectSpeakers("hey @pixel @echo", [pixel, echo, nova], {
        botStates: [
          makeBotState(pixel, {
            cooldownUntil: now + 1000,
          }),
          makeBotState(echo, {
            consecutiveCount: 3,
          }),
        ],
        now,
        talkativenessRoll: () => 0,
      }).map((speaker) => speaker.bot.id),
    ).toEqual([nova.id]);
  });

  it("prefers thread continuations ahead of talkativeness winners", () => {
    const pixel = makeBot({
      talkativeness: 100,
    });
    const echo = makeBot({
      displayName: "Echo",
      id: BotId.makeUnsafe("bot-echo"),
      name: "echo",
      talkativeness: 0,
    });

    expect(
      selectSpeakers("chat keeps moving", [pixel, echo], {
        now,
        recentMessages: [
          makeBotMessage(echo, "2026-04-03T00:00:00.000Z"),
          new SessionMessageRecord({
            botId: null,
            content: "viewer line",
            id: SessionMessageId.makeUnsafe("message-viewer"),
            isBot: false,
            modelUsed: null,
            platform: "mock",
            sentAt: "2026-04-03T00:00:01.000Z",
            sessionId: SessionId.makeUnsafe("session-1"),
            tokensUsed: null,
            username: ChatUsername.makeUnsafe("viewer-1"),
          }),
        ],
        talkativenessRoll: () => 0,
        threadRoll: () => 0,
      }).map((speaker) => [speaker.bot.id, speaker.reason]),
    ).toEqual([
      [echo.id, "thread"],
      [pixel.id, "talkativeness"],
    ]);
  });

  it("gives the director-nudged bot a guaranteed slot in the next cycle", () => {
    const pixel = makeBot({
      talkativeness: 0,
    });
    const echo = makeBot({
      displayName: "Echo",
      id: BotId.makeUnsafe("bot-echo"),
      name: "echo",
      talkativeness: 0,
    });
    const nova = makeBot({
      displayName: "Nova",
      id: BotId.makeUnsafe("bot-nova"),
      name: "nova",
      talkativeness: 100,
    });

    expect(
      selectSpeakers("chat keeps moving", [pixel, echo, nova], {
        directorDirective: new DirectorDirective({
          hint: "[CONTEXT: Current vibe: stale.]",
          nudgedBotName: "echo",
          talkativenessBoostPercent: 20,
        }),
        now,
        talkativenessRoll: () => 0,
      }).map((speaker) => [speaker.bot.id, speaker.reason]),
    ).toEqual([
      [echo.id, "director"],
      [pixel.id, "talkativeness"],
      [nova.id, "talkativeness"],
    ]);
  });

  it("calculates per-trigger delays within the expected ranges", () => {
    expect(
      calculateResponseDelay("mention", {
        baseDelayRoll: () => 0,
      }),
    ).toBe(1000);
    expect(
      calculateResponseDelay("thread", {
        baseDelayRoll: () => 1,
      }),
    ).toBe(4000);
    expect(
      calculateResponseDelay("talkativeness", {
        baseDelayRoll: () => 0,
      }),
    ).toBe(2000);
    expect(
      calculateResponseDelay("silence", {
        baseDelayRoll: () => 1,
      }),
    ).toBe(8000);
  });

  it("adds stagger delay for later selected speakers", () => {
    expect(
      calculateResponseDelay("mention", {
        baseDelayRoll: () => 0,
        selectionIndex: 2,
        staggerDelayRoll: () => 0,
      }),
    ).toBe(2000);
  });

  it("picks the highest-talkativeness eligible silence-breaker bot", () => {
    const pixel = makeBot({
      talkativeness: 55,
    });
    const echo = makeBot({
      displayName: "Echo",
      id: BotId.makeUnsafe("bot-echo"),
      name: "echo",
      talkativeness: 85,
    });
    const nova = makeBot({
      displayName: "Nova",
      id: BotId.makeUnsafe("bot-nova"),
      name: "nova",
      talkativeness: 95,
    });

    expect(
      selectSilenceBreaker([pixel, echo, nova], {
        botStates: [
          makeBotState(nova, {
            cooldownUntil: now + 1000,
          }),
        ],
        now,
      })?.id,
    ).toBe(echo.id);
  });

  it("lets the director nudge override the default silence-breaker choice", () => {
    const pixel = makeBot({
      talkativeness: 55,
    });
    const echo = makeBot({
      displayName: "Echo",
      id: BotId.makeUnsafe("bot-echo"),
      name: "echo",
      talkativeness: 85,
    });

    expect(
      selectSilenceBreaker([pixel, echo], {
        directorDirective: new DirectorDirective({
          hint: "[CONTEXT: Why now: Echo can revive this topic.]",
          nudgedBotName: "pixel",
          talkativenessBoostPercent: 0,
        }),
        now,
      })?.id,
    ).toBe(pixel.id);
  });

  it("assembles live mention prompts from the recent chat window and fallback settings", () => {
    const pixel = makeBot({
      exampleMessages: ["clip it", "keep it moving"],
      fallbackModels: ["openrouter/fallback-model"],
      postHistoryPrompt: "Stay dry and brief.",
    });
    const request = makeMentionResponseRequest(
      pixel,
      "mock",
      [
        new SessionMessageRecord({
          botId: null,
          content: "stale opener",
          id: SessionMessageId.makeUnsafe("message-stale"),
          isBot: false,
          modelUsed: null,
          platform: "mock",
          sentAt: "2026-04-02T23:59:59.000Z",
          sessionId: SessionId.makeUnsafe("session-1"),
          tokensUsed: null,
          username: ChatUsername.makeUnsafe("viewer-old"),
        }),
        new SessionMessageRecord({
          botId: null,
          content: "fresh setup",
          id: SessionMessageId.makeUnsafe("message-fresh"),
          isBot: false,
          modelUsed: null,
          platform: "mock",
          sentAt: "2026-04-03T00:09:30.000Z",
          sessionId: SessionId.makeUnsafe("session-1"),
          tokensUsed: null,
          username: ChatUsername.makeUnsafe("viewer-1"),
        }),
        new SessionMessageRecord({
          botId: PlatformBotId.makeUnsafe("bot-echo"),
          content: "bot follow-up",
          id: SessionMessageId.makeUnsafe("message-bot"),
          isBot: true,
          modelUsed: "openrouter/mock-model",
          platform: "mock",
          sentAt: "2026-04-03T00:10:00.000Z",
          sessionId: SessionId.makeUnsafe("session-1"),
          tokensUsed: 14,
          username: ChatUsername.makeUnsafe("echo"),
        }),
      ],
      [],
      "[CONTEXT: Current vibe: stale. Consider steering the conversation toward: co-op games.]",
    );

    expect(request.messages).toEqual([
      {
        content: [
          "You are pixel. You are chatting in a live stream chat on mock.",
          "",
          "dry humor",
          "",
          "test bot",
          "",
          "RULES:",
          "- Keep responses between 3 and 12 words",
          "- DO NOT include your name or any prefix in messages",
          "- DO NOT use action tags like *action*",
          "- DO NOT continue or respond as other chatters",
          "- Just write your direct response",
          "",
          "Stay dry and brief.",
        ].join("\n"),
        role: "system",
      },
      {
        content: "[example] pixel: clip it",
        role: "assistant",
      },
      {
        content: "[example] pixel: keep it moving",
        role: "assistant",
      },
      {
        content: "[external] viewer-1: fresh setup",
        role: "user",
      },
      {
        content: "echo: bot follow-up",
        role: "user",
      },
      {
        content:
          "[CONTEXT: Current vibe: stale. Consider steering the conversation toward: co-op games.]",
        role: "system",
      },
    ]);
    expect(request.settings).toMatchObject({
      fallbackModels: ["openrouter/fallback-model"],
      maxOutputTokens: 120,
      stopSequences: ["\n"],
      temperature: 0.8,
    });
  });
});
