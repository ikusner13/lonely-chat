import { describe, expect, it } from "@effect/vitest";

import { BotId, BotRecord } from "../bots/bot-record";
import { BotId as PlatformBotId, ChatUsername } from "../platforms/Services/platform-adapter";
import { SessionId } from "../sessions/Services/session-service";
import { SessionMessageId, SessionMessageRecord } from "../sessions/session-message-record";
import { BotSpeakerState, selectSpeakers } from "./mention-response";

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
});
