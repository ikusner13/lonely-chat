import * as Effect from "effect/Effect";
import type { RequestHandler } from "./$types";

import { effectRunner } from "$lib/server/runtime";
import { BotId } from "../../../../bots/bot-record";
import { KickPlatformAdapterLive } from "../../../../platforms/Layers/kick-platform-adapter";
import {
  KickAuthorizationCallbackRequest,
  KickPlatformAdapter,
} from "../../../../platforms/Services/kick-platform-adapter";

const badRequest = 400;
const found = 302;
const oauthCookiePrefix = "kick-oauth-";

const redirectResponse = (location: string): Response =>
  new Response(null, {
    headers: {
      location,
    },
    status: found,
  });

interface KickOauthStateCookie {
  readonly botId: string;
  readonly codeVerifier: string;
}

const isKickOauthStateCookie = (value: unknown): value is KickOauthStateCookie => {
  if (value === null || typeof value !== "object") {
    return false;
  }

  const botId = "botId" in value ? value.botId : undefined;
  const codeVerifier = "codeVerifier" in value ? value.codeVerifier : undefined;

  return (
    typeof botId === "string" &&
    botId.length > 0 &&
    typeof codeVerifier === "string" &&
    codeVerifier.length > 0
  );
};

export const GET: RequestHandler = async ({ cookies, url }) => {
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  if (code === null || code.trim().length === 0) {
    return new Response("Missing Kick authorization code.", { status: badRequest });
  }

  if (state === null || state.trim().length === 0) {
    return new Response("Missing Kick auth state.", { status: badRequest });
  }

  const cookieName = `${oauthCookiePrefix}${state}`;
  const stateCookie = cookies.get(cookieName);

  if (stateCookie === undefined) {
    return new Response("Missing Kick auth verifier.", { status: badRequest });
  }

  cookies.delete(cookieName, {
    path: "/auth/kick/callback",
  });

  let parsedState: unknown;

  try {
    parsedState = JSON.parse(stateCookie);
  } catch {
    return new Response("Invalid Kick auth verifier.", { status: badRequest });
  }

  if (!isKickOauthStateCookie(parsedState)) {
    return new Response("Invalid Kick auth verifier.", { status: badRequest });
  }

  await effectRunner(
    KickPlatformAdapter.use((kickPlatformAdapter) =>
      kickPlatformAdapter.completeAuthorization(
        new KickAuthorizationCallbackRequest({
          botId: BotId.makeUnsafe(parsedState.botId),
          code,
          codeVerifier: parsedState.codeVerifier,
        }),
      ),
    ).pipe(Effect.provide(KickPlatformAdapterLive)),
  );

  return redirectResponse(`/bots#bot-${parsedState.botId}`);
};
