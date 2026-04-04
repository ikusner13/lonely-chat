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
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  if (code === null || code.trim().length === 0) {
    return new Response("Missing Twitch authorization code.", { status: badRequest });
  }

  if (state === null || state.trim().length === 0) {
    return new Response("Missing Twitch auth state.", { status: badRequest });
  }

  await effectRunner(
    TwitchPlatformAdapter.use((twitchPlatformAdapter) =>
      twitchPlatformAdapter.completeAuthorization(BotId.makeUnsafe(state), code),
    ).pipe(Effect.provide(TwitchPlatformAdapterLive)),
  );

  return redirectResponse(`/bots#bot-${state}`);
};
