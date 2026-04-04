import * as Schema from "effect/Schema";

import { publishKickSessionMessage } from "../../../../../platforms/Layers/kick-platform-adapter";

const noContentStatus = 204;
const badRequestStatus = 400;
const kickChatMessageEvent = "chat.message.sent";

const KickWebhookUser = Schema.Struct({
  channel_slug: Schema.NonEmptyString,
  username: Schema.NonEmptyString,
});

const KickChatMessageWebhookPayload = Schema.Struct({
  broadcaster: KickWebhookUser,
  content: Schema.String,
  sender: KickWebhookUser,
});

const decodeKickChatMessageWebhookPayload = Schema.decodeUnknownSync(KickChatMessageWebhookPayload);

export const POST = async ({ request }: { request: Request }) => {
  if (request.headers.get("Kick-Event-Type") !== kickChatMessageEvent) {
    return new Response(null, {
      status: noContentStatus,
    });
  }

  try {
    const payload = decodeKickChatMessageWebhookPayload(await request.json());

    publishKickSessionMessage({
      channel: payload.broadcaster.channel_slug,
      text: payload.content,
      username: payload.sender.username,
    });

    return new Response(null, {
      status: noContentStatus,
    });
  } catch {
    return new Response("Invalid Kick webhook payload.", {
      status: badRequestStatus,
    });
  }
};
