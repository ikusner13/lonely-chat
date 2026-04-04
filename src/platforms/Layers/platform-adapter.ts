import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Stream from "effect/Stream";

import { BotService } from "../../bots/Services/bot-service";
import {
  makeKickSessionPlatformAdapter,
  makeLiveDependencies as makeKickLiveDependencies,
} from "./kick-platform-adapter";
import { makeMockPlatformAdapter } from "./mock-platform-adapter";
import {
  makeLiveDependencies as makeTwitchLiveDependencies,
  makeTwitchSessionPlatformAdapter,
} from "./twitch-platform-adapter";
import type { BotConnection, PlatformAdapterShape } from "../Services/platform-adapter";
import {
  PlatformAdapter,
  PlatformConnectionError,
  PlatformSendError,
} from "../Services/platform-adapter";
import type { KickAdapterDependencies } from "./kick-platform-adapter";
import { KickPlatformConfig } from "../Services/kick-platform-config";
import type { KickPlatformConfigShape } from "../Services/kick-platform-config";
import type { TwitchAdapterDependencies } from "./twitch-platform-adapter";
import { TwitchPlatformConfig } from "../Services/twitch-platform-config";
import type { TwitchPlatformConfigShape } from "../Services/twitch-platform-config";

interface PlatformAdapterLayerOptions {
  readonly kickDependencies?: Partial<KickAdapterDependencies>;
  readonly kickConfig?: KickPlatformConfigShape | null;
  readonly twitchDependencies?: Partial<TwitchAdapterDependencies>;
  readonly twitchConfig?: TwitchPlatformConfigShape | null;
}

const readConfiguredTwitchPlatform: Effect.Effect<TwitchPlatformConfigShape | null> = Effect.gen(
  function* readTwitchConfig() {
    return yield* TwitchPlatformConfig;
  },
).pipe(
  Effect.provide(TwitchPlatformConfig.layer),
  Effect.catch(() => Effect.succeed(null as TwitchPlatformConfigShape | null)),
);

const readConfiguredKickPlatform: Effect.Effect<KickPlatformConfigShape | null> = Effect.gen(
  function* readKickConfig() {
    return yield* KickPlatformConfig;
  },
).pipe(
  Effect.provide(KickPlatformConfig.layer),
  Effect.catch(() => Effect.succeed(null as KickPlatformConfigShape | null)),
);

const makeUnsupportedConnectionError = (
  bot: BotConnection,
  cause?: unknown,
): PlatformConnectionError =>
  new PlatformConnectionError({
    botId: bot.botId,
    cause,
    platform: bot.platform,
  });

const makeUnsupportedSendError = (bot: BotConnection, cause?: unknown): PlatformSendError =>
  new PlatformSendError({
    cause,
    channel: bot.channel,
    platform: bot.platform,
  });

const makeHybridPlatformAdapter = ({
  kickPlatformAdapter,
  mockPlatformAdapter,
  twitchPlatformAdapter,
}: {
  readonly kickPlatformAdapter: PlatformAdapterShape | null;
  readonly mockPlatformAdapter: PlatformAdapterShape;
  readonly twitchPlatformAdapter: PlatformAdapterShape | null;
}): PlatformAdapterShape => {
  const connect = (bot: BotConnection) => {
    switch (bot.platform) {
      case "mock": {
        return mockPlatformAdapter.connect(bot);
      }
      case "twitch": {
        if (twitchPlatformAdapter === null) {
          return Effect.fail(
            makeUnsupportedConnectionError(
              bot,
              new Error("Twitch platform adapter is not configured."),
            ),
          );
        }

        return twitchPlatformAdapter.connect(bot);
      }
      case "kick": {
        if (kickPlatformAdapter === null) {
          return Effect.fail(
            makeUnsupportedConnectionError(
              bot,
              new Error("Kick platform adapter is not configured."),
            ),
          );
        }

        return kickPlatformAdapter.connect(bot);
      }
      default: {
        return Effect.fail(
          makeUnsupportedConnectionError(
            bot,
            new Error(`Unsupported platform: ${String(bot.platform)}`),
          ),
        );
      }
    }
  };

  const disconnect = (bot: BotConnection) => {
    switch (bot.platform) {
      case "mock": {
        return mockPlatformAdapter.disconnect(bot);
      }
      case "twitch": {
        return twitchPlatformAdapter?.disconnect(bot) ?? Effect.void;
      }
      case "kick": {
        return kickPlatformAdapter?.disconnect(bot) ?? Effect.void;
      }
      default: {
        return Effect.void;
      }
    }
  };

  const sendMessage = (bot: BotConnection, text: string) => {
    switch (bot.platform) {
      case "mock": {
        return mockPlatformAdapter.sendMessage(bot, text);
      }
      case "twitch": {
        if (twitchPlatformAdapter === null) {
          return Effect.fail(
            makeUnsupportedSendError(bot, new Error("Twitch platform adapter is not configured.")),
          );
        }

        return twitchPlatformAdapter.sendMessage(bot, text);
      }
      case "kick": {
        if (kickPlatformAdapter === null) {
          return Effect.fail(
            makeUnsupportedSendError(bot, new Error("Kick platform adapter is not configured.")),
          );
        }

        return kickPlatformAdapter.sendMessage(bot, text);
      }
      default: {
        return Effect.fail(
          makeUnsupportedSendError(bot, new Error(`Unsupported platform: ${String(bot.platform)}`)),
        );
      }
    }
  };

  const livePlatformAdapters = [twitchPlatformAdapter, kickPlatformAdapter].filter(
    (platformAdapter): platformAdapter is PlatformAdapterShape => platformAdapter !== null,
  );

  const listenChat = (channel: BotConnection["channel"]) => {
    let stream = mockPlatformAdapter.listenChat(channel);

    for (const platformAdapter of livePlatformAdapters) {
      stream = Stream.merge(stream, platformAdapter.listenChat(channel));
    }

    return stream;
  };

  return {
    connect,
    disconnect,
    listenChat,
    sendMessage,
  };
};

export const makePlatformAdapterLayer = (
  options: PlatformAdapterLayerOptions = {},
): Layer.Layer<PlatformAdapter, never, BotService> =>
  Layer.effect(
    PlatformAdapter,
    Effect.gen(function* makePlatformAdapterLayerEffect() {
      const botService = yield* BotService;
      const { platformAdapter: mockPlatformAdapter } = yield* makeMockPlatformAdapter;
      const kickConfig =
        options.kickConfig === undefined ? yield* readConfiguredKickPlatform : options.kickConfig;
      const twitchConfig =
        options.twitchConfig === undefined
          ? yield* readConfiguredTwitchPlatform
          : options.twitchConfig;
      const kickPlatformAdapter =
        kickConfig === null
          ? null
          : yield* makeKickSessionPlatformAdapter({
              ...makeKickLiveDependencies(kickConfig),
              ...options.kickDependencies,
              botService,
              config: options.kickDependencies?.config ?? options.kickConfig ?? kickConfig,
            });
      const twitchPlatformAdapter =
        twitchConfig === null
          ? null
          : yield* makeTwitchSessionPlatformAdapter({
              ...makeTwitchLiveDependencies(twitchConfig),
              ...options.twitchDependencies,
              botService,
              config: options.twitchDependencies?.config ?? options.twitchConfig ?? twitchConfig,
            });

      return PlatformAdapter.of(
        makeHybridPlatformAdapter({
          kickPlatformAdapter,
          mockPlatformAdapter,
          twitchPlatformAdapter,
        }),
      );
    }),
  );

export const PlatformAdapterLive = makePlatformAdapterLayer();
