import * as Effect from "effect/Effect";
import { command, query } from "$app/server";

import { effectRunner } from "$lib/server/runtime";
import { SessionService } from "../../sessions/Services/session-service";

export const getDashboardState = query(async () =>
  effectRunner(
    Effect.all({
      activeAlerts: SessionService.use((sessionService) => sessionService.getActiveAlerts()),
      activeSession: SessionService.use((sessionService) => sessionService.getActiveSession()),
      mostRecentSession: SessionService.use((sessionService) =>
        sessionService.getMostRecentSession(),
      ),
    }),
  ),
);

export const startSession = command(async () => {
  await effectRunner(
    SessionService.use((sessionService) => sessionService.startSession()).pipe(
      Effect.catchTag("SessionStartError", () => Effect.void),
    ),
  );

  await getDashboardState().refresh();
});

export const stopSession = command(async () => {
  await effectRunner(SessionService.use((sessionService) => sessionService.stopSession()));

  await getDashboardState().refresh();
});
