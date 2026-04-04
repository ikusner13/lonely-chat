import { createHash, randomBytes } from "node:crypto";
import * as Effect from "effect/Effect";
import type { RequestHandler } from "./$types";

import { effectRunner } from "$lib/server/runtime";
import { BotId } from "../../../../bots/bot-record";
import { KickPlatformAdapterLive } from "../../../../platforms/Layers/kick-platform-adapter";
import {
  KickAuthorizationUrlRequest,
  KickPlatformAdapter,
} from "../../../../platforms/Services/kick-platform-adapter";

const badRequest = 400;
const found = 302;
const oauthCookieMaxAgeSeconds = 10 * 60;
const oauthCookiePrefix = "kick-oauth-";

const redirectResponse = (location: string): Response =>
  new Response(null, {
    headers: {
      location,
    },
    status: found,
  });

const createOauthState = (): string => randomBytes(16).toString("hex");
const createCodeVerifier = (): string => randomBytes(32).toString("base64url");
const createCodeChallenge = (verifier: string): string =>
  createHash("sha256").update(verifier).digest("base64url");

export const GET: RequestHandler = async ({ cookies, url }) => {
  const botId = url.searchParams.get("botId");

  if (botId === null || botId.trim().length === 0) {
    return new Response("Missing botId query parameter.", { status: badRequest });
  }

  const state = createOauthState();
  const codeVerifier = createCodeVerifier();
  const authorizeUrl = await effectRunner(
    KickPlatformAdapter.use((kickPlatformAdapter) =>
      kickPlatformAdapter.getAuthorizationUrl(
        new KickAuthorizationUrlRequest({
          botId: BotId.makeUnsafe(botId),
          codeChallenge: createCodeChallenge(codeVerifier),
          state,
        }),
      ),
    ).pipe(Effect.provide(KickPlatformAdapterLive)),
  );

  cookies.set(
    `${oauthCookiePrefix}${state}`,
    JSON.stringify({
      botId,
      codeVerifier,
    }),
    {
      httpOnly: true,
      maxAge: oauthCookieMaxAgeSeconds,
      path: "/auth/kick/callback",
      sameSite: "lax",
      secure: url.protocol === "https:",
    },
  );

  return redirectResponse(authorizeUrl);
};
