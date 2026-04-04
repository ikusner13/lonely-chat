import * as Effect from "effect/Effect";
import { query } from "$app/server";

import { effectRunner } from "$lib/server/runtime";
import type { SessionRecord } from "../../sessions/session-record";
import type { AnalyticsBotSummary, AnalyticsOverview } from "../../sessions/session-analytics";
import { SessionService } from "../../sessions/Services/session-service";

export const getAnalyticsPageData = query(async () =>
  effectRunner(
    Effect.all({
      botSummaries: SessionService.use((sessionService) =>
        sessionService.getAnalyticsBotSummaries(),
      ),
      overview: SessionService.use((sessionService) => sessionService.getAnalyticsOverview()),
      sessionHistory: SessionService.use((sessionService) =>
        sessionService.getAnalyticsSessionHistory(),
      ),
    }),
  ),
);

export { type AnalyticsBotSummary, type AnalyticsOverview, type SessionRecord };
