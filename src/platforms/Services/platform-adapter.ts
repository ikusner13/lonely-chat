import type { Effect, Stream } from "effect";
import { Schema, ServiceMap } from "effect";

import { BotId } from "../../bots/bot-record";

export { BotId };

export const PlatformName = Schema.Literals(["mock", "twitch", "kick"]);
export type PlatformName = typeof PlatformName.Type;

export const ChatMessageDirection = Schema.Literals(["incoming", "outgoing"]);
export type ChatMessageDirection = typeof ChatMessageDirection.Type;

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

export class PlatformConnectionError extends Schema.TaggedErrorClass<PlatformConnectionError>()(
  "PlatformConnectionError",
  {
    botId: BotId,
    cause: Schema.optional(Schema.Defect),
    platform: PlatformName,
  },
) {}

export class PlatformSendError extends Schema.TaggedErrorClass<PlatformSendError>()(
  "PlatformSendError",
  {
    cause: Schema.optional(Schema.Defect),
    channel: ChannelName,
    platform: PlatformName,
  },
) {}

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
