import { describe, expect, it } from "@effect/vitest";
import { render } from "svelte/server";

import { BotId } from "../../bots/bot-record";
import { ChannelName } from "../../platforms/Services/platform-adapter";
import { AnalyticsBotSummary, AnalyticsOverview } from "../../sessions/session-analytics";
import { SessionId } from "../../sessions/Services/session-service";
import { SessionRecord } from "../../sessions/session-record";
import AnalyticsContent from "./analytics-content.svelte";

describe("analytics page", () => {
  it("renders persisted session and bot analytics", async () => {
    const rendered = await render(AnalyticsContent, {
      props: {
        botSummaries: [
          new AnalyticsBotSummary({
            botId: BotId.makeUnsafe("bot-pixel"),
            botName: "pixel_bot",
            displayName: "Pixel",
            messageCount: 4,
            platform: "twitch",
            sessionCount: 2,
            totalTokensUsed: 150,
          }),
        ],
        overview: new AnalyticsOverview({
          totalCostUsd: 1.25,
          totalMessages: 6,
          totalSessions: 2,
          totalTokensUsed: 200,
        }),
        sessionHistory: [
          new SessionRecord({
            channel: ChannelName.makeUnsafe("lonely-chat"),
            costLimitUsd: null,
            endReason: "manual",
            endedAt: "2026-04-03T12:05:00.000Z",
            id: SessionId.makeUnsafe("session-2"),
            platform: "mock",
            startedAt: "2026-04-03T12:00:00.000Z",
            status: "ended",
            timeLimitSeconds: null,
            totalCostUsd: 0.5,
            totalMessages: 4,
            totalTokensUsed: 80,
          }),
        ],
      },
    });

    expect(rendered.body).toContain("Total sessions");
    expect(rendered.body).toContain("$1.2500");
    expect(rendered.body).toContain("lonely-chat");
    expect(rendered.body).toContain("Pixel");
    expect(rendered.body).toContain("messages sent");
    expect(rendered.body).toContain("Session Log");
  });
});
