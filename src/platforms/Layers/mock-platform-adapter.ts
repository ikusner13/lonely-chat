import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as PubSub from "effect/PubSub";
import * as Ref from "effect/Ref";
import * as Stream from "effect/Stream";

import { PlatformAdapter } from "../Services/platform-adapter";
import type {
  BotConnection,
  ChannelName,
  ChatMessage,
  PlatformAdapterShape,
  PlatformConnectionError,
  PlatformName,
  PlatformSendError,
} from "../Services/platform-adapter";

export interface MockPlatformAdapterShape {
  readonly platformAdapter: PlatformAdapterShape;
  readonly emitIncomingMessage: (
    message: Omit<ChatMessage, "direction" | "platform">,
  ) => Effect.Effect<void>;
  readonly getConnectedBots: Effect.Effect<readonly BotConnection[]>;
  readonly getSentMessages: Effect.Effect<readonly ChatMessage[]>;
}

const mockPlatform: PlatformName = "mock";
const messageBufferCapacity = 128;

const makePlatformConnectionError = (
  platform: PlatformName,
  botId: BotConnection["botId"],
): PlatformConnectionError => ({
  _tag: "PlatformConnectionError",
  botId,
  platform,
});

const makePlatformSendError = (channel: ChannelName): PlatformSendError => ({
  _tag: "PlatformSendError",
  channel,
  platform: mockPlatform,
});

export const makeMockPlatformAdapter = Effect.gen(function* makeMockPlatformAdapter() {
  const connectionsRef = yield* Ref.make<readonly BotConnection[]>([]);
  const sentMessagesRef = yield* Ref.make<readonly ChatMessage[]>([]);
  const messagesPubSub = yield* PubSub.bounded<ChatMessage>({
    capacity: messageBufferCapacity,
  });

  const connect = Effect.fn("PlatformAdapter.connect")(function* connectMockBot(
    bot: BotConnection,
  ) {
    if (bot.platform !== mockPlatform) {
      return yield* Effect.fail(makePlatformConnectionError(bot.platform, bot.botId));
    }

    const connections = yield* Ref.get(connectionsRef);

    if (
      connections.some(
        (connection) =>
          connection.botId === bot.botId &&
          connection.channel === bot.channel &&
          connection.platform === bot.platform,
      )
    ) {
      return;
    }

    yield* Ref.set(connectionsRef, [...connections, bot]);
  });

  const disconnect = Effect.fn("PlatformAdapter.disconnect")(function* disconnectMockBot(
    bot: BotConnection,
  ) {
    const connections = yield* Ref.get(connectionsRef);

    yield* Ref.set(
      connectionsRef,
      connections.filter(
        (connection) =>
          !(
            connection.botId === bot.botId &&
            connection.channel === bot.channel &&
            connection.platform === bot.platform
          ),
      ),
    );
  });

  const sendMessage = Effect.fn("PlatformAdapter.sendMessage")(function* sendMockMessage(
    bot: BotConnection,
    text: string,
  ) {
    const connections = yield* Ref.get(connectionsRef);
    const connectedBot = connections.find(
      (connection) =>
        connection.botId === bot.botId &&
        connection.channel === bot.channel &&
        connection.platform === bot.platform,
    );

    if (connectedBot === undefined) {
      return yield* Effect.fail(makePlatformSendError(bot.channel));
    }

    const message: ChatMessage = {
      botId: connectedBot.botId,
      channel: bot.channel,
      direction: "outgoing",
      platform: mockPlatform,
      text,
      username: connectedBot.username,
    };

    const sentMessages = yield* Ref.get(sentMessagesRef);

    yield* Ref.set(sentMessagesRef, [...sentMessages, message]);
    yield* PubSub.publish(messagesPubSub, message);
  });

  const listenChat = (channel: ChannelName): Stream.Stream<ChatMessage> =>
    Stream.fromPubSub(messagesPubSub).pipe(Stream.filter((message) => message.channel === channel));

  const emitIncomingMessage = Effect.fn("MockPlatformAdapter.emitIncomingMessage")(
    function* emitMockIncomingMessage(message: Omit<ChatMessage, "direction" | "platform">) {
      yield* PubSub.publish(messagesPubSub, {
        ...message,
        direction: "incoming",
        platform: mockPlatform,
      });
    },
  );

  return {
    emitIncomingMessage,
    getConnectedBots: Ref.get(connectionsRef),
    getSentMessages: Ref.get(sentMessagesRef),
    platformAdapter: {
      connect,
      disconnect,
      listenChat,
      sendMessage,
    },
  } satisfies MockPlatformAdapterShape;
});

export const MockPlatformAdapterLive = Layer.effect(
  PlatformAdapter,
  makeMockPlatformAdapter.pipe(
    Effect.map(({ platformAdapter }) => PlatformAdapter.of(platformAdapter)),
  ),
);
