import * as Effect from "effect/Effect";
import type { RequestHandler } from "./$types";

import { effectRunner } from "$lib/server/runtime";
import { TwitchPlatformAdapterLive } from "../../../../platforms/Layers/twitch-platform-adapter";
import { BotId } from "../../../../bots/bot-record";
import { TwitchPlatformAdapter } from "../../../../platforms/Services/twitch-platform-adapter";

const badRequest = 400;
const found = 302;
const redirectResponse = (location: string): Response =>
  new Response(null, {
    headers: {
      location,
    },
    status: found,
  });

export const GET: RequestHandler = async ({ url }) => {
  const botId = url.searchParams.get("botId");

  if (botId === null || botId.trim().length === 0) {
    return new Response("Missing botId query parameter.", { status: badRequest });
  }

  const authorizeUrl = await effectRunner(
    TwitchPlatformAdapter.use((twitchPlatformAdapter) =>
      twitchPlatformAdapter.getAuthorizationUrl(BotId.makeUnsafe(botId)),
    ).pipe(Effect.provide(TwitchPlatformAdapterLive)),
  );

  return redirectResponse(authorizeUrl);
};
