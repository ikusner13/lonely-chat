import { describe, expect, it } from "@effect/vitest";
import { render } from "svelte/server";

import {
  BotRuntimeSignal,
  BotRuntimeStatus,
  SessionAlert,
  SessionId,
} from "../sessions/Services/session-service";
import { ChannelName } from "../platforms/Services/platform-adapter";
import { BotId } from "../bots/bot-record";
import { SessionRecord } from "../sessions/session-record";
import DashboardContent from "./dashboard-content.svelte";

describe("dashboard content", () => {
  it("renders degraded and offline bot states with recovery signals", async () => {
    const rendered = await render(DashboardContent, {
      props: {
        activeAlerts: [
          new SessionAlert({
            currentValue: 7.5,
            limitValue: 10,
            metric: "cost",
            sessionId: SessionId.makeUnsafe("session-active"),
            thresholdPercent: 75,
          }),
        ],
        activeSession: new SessionRecord({
          channel: ChannelName.makeUnsafe("lonely-chat"),
          costLimitUsd: 10,
          endReason: null,
          endedAt: null,
          id: SessionId.makeUnsafe("session-active"),
          platform: "mock",
          startedAt: "2026-04-04T12:00:00.000Z",
          status: "active",
          timeLimitSeconds: 600,
          totalCostUsd: 7.5,
          totalMessages: 12,
          totalTokensUsed: 240,
        }),
        botRuntimeSignals: [
          new BotRuntimeSignal({
            botId: BotId.makeUnsafe("bot-offline"),
            botName: "pixel_bot",
            createdAt: "2026-04-04T12:02:00.000Z",
            message: "Pixel is offline because live credentials are missing.",
            platform: "twitch",
            type: "auth_failure",
          }),
          new BotRuntimeSignal({
            botId: BotId.makeUnsafe("bot-degraded"),
            botName: "echo_bot",
            createdAt: "2026-04-04T12:03:00.000Z",
            message: "Echo recovered and is online.",
            platform: "kick",
            type: "recovered",
          }),
        ],
        botRuntimeStatuses: [
          new BotRuntimeStatus({
            botId: BotId.makeUnsafe("bot-offline"),
            botName: "pixel_bot",
            consecutiveAiFailures: 0,
            detail: "Pixel is offline because live credentials are missing.",
            displayName: "Pixel",
            platform: "twitch",
            state: "offline",
            updatedAt: "2026-04-04T12:02:00.000Z",
          }),
          new BotRuntimeStatus({
            botId: BotId.makeUnsafe("bot-degraded"),
            botName: "echo_bot",
            consecutiveAiFailures: 3,
            detail: "Echo is degraded after 3 consecutive AI failures.",
            displayName: "Echo",
            platform: "kick",
            state: "degraded",
            updatedAt: "2026-04-04T12:03:00.000Z",
          }),
        ],
        mostRecentSession: null,
        onStart: async () => undefined,
        onStop: async () => undefined,
        starting: false,
        stopping: false,
      },
    });

    expect(rendered.body).toContain("Active Bots");
    expect(rendered.body).toContain("Recovery Signals");
    expect(rendered.body).toContain("Offline");
    expect(rendered.body).toContain("Degraded");
    expect(rendered.body).toContain("Auth Failure");
    expect(rendered.body).toContain("Recovered");
    expect(rendered.body).toContain("Consecutive AI failures: 3");
  });
});
