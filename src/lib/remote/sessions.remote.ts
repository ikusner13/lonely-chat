import * as Schema from "effect/Schema";
import { command, query } from "$app/server";

import { effectRunner } from "$lib/server/runtime";
import {
  SessionExportFormat,
  SessionId,
  SessionService,
} from "../../sessions/Services/session-service";

export const getChatViewerState = query(async () => {
  const activeSession = await effectRunner(SessionService.use((s) => s.getActiveSession()));

  const selectedSession =
    activeSession ?? (await effectRunner(SessionService.use((s) => s.getMostRecentSession())));

  const messages =
    selectedSession === null
      ? []
      : await effectRunner(SessionService.use((s) => s.getSessionMessages(selectedSession.id)));

  return { activeSession, messages, selectedSession };
});

export const exportSession = command(
  "unchecked",
  async ({
    format,
    sessionId,
  }: {
    readonly format: string;
    readonly sessionId: string;
  }): Promise<{ content: string; format: string } | null> => {
    const decoded = Schema.decodeUnknownResult(SessionExportFormat)(format);

    if (decoded._tag !== "Success") {
      return null;
    }

    const result = await effectRunner(
      SessionService.use((s) => s.exportSession(SessionId.makeUnsafe(sessionId), decoded.success)),
    );

    if (result === null) {
      return null;
    }

    return { content: result, format: decoded.success };
  },
);
