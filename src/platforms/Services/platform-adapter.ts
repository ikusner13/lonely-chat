import type { Effect, Stream } from "effect";
import { Schema, ServiceMap } from "effect";

export const PlatformName = Schema.Literals(["mock", "twitch", "kick"]);
export type PlatformName = typeof PlatformName.Type;

export const ChatMessageDirection = Schema.Literals(["incoming", "outgoing"]);
export type ChatMessageDirection = typeof ChatMessageDirection.Type;

export const BotId = Schema.String.pipe(Schema.brand("BotId"));
export type BotId = typeof BotId.Type;

export const ChannelName = Schema.String.pipe(Schema.brand("ChannelName"));
export type ChannelName = typeof ChannelName.Type;

export const ChatUsername = Schema.String.pipe(Schema.brand("ChatUsername"));
export type ChatUsername = typeof ChatUsername.Type;

export interface BotConnection {
  readonly botId: BotId;
  readonly channel: ChannelName;
  readonly username: ChatUsername;
  readonly platform: PlatformName;
}

export interface ChatMessage {
  readonly channel: ChannelName;
  readonly text: string;
  readonly direction: ChatMessageDirection;
  readonly platform: PlatformName;
  readonly username: ChatUsername;
  readonly botId?: BotId;
}

export interface PlatformConnectionError {
  readonly _tag: "PlatformConnectionError";
  readonly platform: PlatformName;
  readonly botId: BotId;
  readonly cause?: unknown;
}

export interface PlatformSendError {
  readonly _tag: "PlatformSendError";
  readonly platform: PlatformName;
  readonly channel: ChannelName;
  readonly cause?: unknown;
}

export interface PlatformAdapterShape {
  readonly connect: (bot: BotConnection) => Effect.Effect<void, PlatformConnectionError>;
  readonly disconnect: (bot: BotConnection) => Effect.Effect<void>;
  readonly sendMessage: (
    bot: BotConnection,
    text: string,
  ) => Effect.Effect<void, PlatformSendError>;
  readonly listenChat: (channel: ChannelName) => Stream.Stream<ChatMessage>;
}

export class PlatformAdapter extends ServiceMap.Service<PlatformAdapter, PlatformAdapterShape>()(
  "lonely-chat/platforms/Services/PlatformAdapter",
) {}
