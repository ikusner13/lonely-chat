import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Stream from "effect/Stream";

import { makeMockPlatformAdapter } from "./Layers/mock-platform-adapter";
import { BotId, ChannelName, ChatUsername } from "./Services/platform-adapter";
import type { BotConnection } from "./Services/platform-adapter";

const mockBot: BotConnection = {
  botId: BotId.makeUnsafe("bot-1"),
  channel: ChannelName.makeUnsafe("lonely-chat"),
  platform: "mock",
  username: ChatUsername.makeUnsafe("lonely-bot"),
};

describe("mock platform adapter", () => {
  it.effect("emits incoming messages to channel listeners", () =>
    Effect.gen(function* emitsIncomingMessagesToChannelListeners() {
      const mockPlatformAdapter = yield* makeMockPlatformAdapter;

      const messagesFiber = yield* mockPlatformAdapter.platformAdapter
        .listenChat(mockBot.channel)
        .pipe(Stream.take(1), Stream.runCollect, Effect.forkChild);

      yield* Effect.yieldNow;
      yield* mockPlatformAdapter.emitIncomingMessage({
        channel: mockBot.channel,
        text: "hello from chat",
        username: ChatUsername.makeUnsafe("viewer-1"),
      });

      const messages = yield* Fiber.join(messagesFiber);

      expect([...messages]).toEqual([
        {
          channel: mockBot.channel,
          direction: "incoming",
          platform: "mock",
          text: "hello from chat",
          username: ChatUsername.makeUnsafe("viewer-1"),
        },
      ]);
    }),
  );

  it.effect("accepts outgoing messages after a bot connects", () =>
    Effect.gen(function* acceptsOutgoingMessagesAfterABotConnects() {
      const mockPlatformAdapter = yield* makeMockPlatformAdapter;

      yield* mockPlatformAdapter.platformAdapter.connect(mockBot);
      yield* mockPlatformAdapter.platformAdapter.sendMessage(mockBot.channel, "bot reply");

      expect(yield* mockPlatformAdapter.getConnectedBots).toEqual([mockBot]);
      expect(yield* mockPlatformAdapter.getSentMessages).toEqual([
        {
          botId: mockBot.botId,
          channel: mockBot.channel,
          direction: "outgoing",
          platform: "mock",
          text: "bot reply",
          username: mockBot.username,
        },
      ]);
    }),
  );
});
