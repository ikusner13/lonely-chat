import { ApiClient } from "@twurple/api";
import { EventSubWsListener } from "@twurple/eventsub-ws";
import { EventEmitter } from "tseep";
import { createLogger } from "@/shared/logger";
import type { TokenManager } from "@/shared/token.service";

export class StreamService extends EventEmitter<{
  "stream:online": () => void;
  "stream:offline": () => void;
}> {
  private readonly apiClient: ApiClient;
  private readonly channelUserId: string;
  private readonly eventSubListener: EventSubWsListener;
  private logger = createLogger("StreamService");

  private constructor(
    apiClient: ApiClient,
    channelUserId: string,
    eventSubListener: EventSubWsListener,
  ) {
    super();
    this.apiClient = apiClient;
    this.channelUserId = channelUserId;
    this.eventSubListener = eventSubListener;
  }

  static async createAndMonitor({
    channelUserId,
    tokenManager,
  }: {
    clientId: string;
    clientSecret: string;
    channelUserId: string;
    tokenManager: TokenManager;
  }): Promise<StreamService> {
    const authProvider = await tokenManager.getAuthProvider("channel");

    const apiClient = new ApiClient({ authProvider });

    const eventSubListener = new EventSubWsListener({
      apiClient,
    });

    const service = new StreamService(apiClient, channelUserId, eventSubListener);

    eventSubListener.onStreamOnline(channelUserId, () => {
      service.logger.info("🟢 Stream is online! Connecting bots...");
      service.emit("stream:online");
    });

    eventSubListener.onStreamOffline(channelUserId, () => {
      service.logger.info("🔴 Stream is offline! Disconnecting bots...");
      service.emit("stream:offline");
    });

    eventSubListener.start();

    // Check if stream is already online
    const isOnline = await service.isStreamOnline();
    if (isOnline) {
      service.logger.info("🟢 Stream is already online, connecting bots...");
      service.emit("stream:online");
    } else {
      service.logger.info("⏸️  Stream is offline, waiting for stream to go online...");
    }

    return service;
  }

  async isStreamOnline(): Promise<boolean> {
    try {
      const stream = await this.apiClient.streams.getStreamByUserId(this.channelUserId);

      if (stream) {
        return true;
      }

      return false;
    } catch (error) {
      this.logger.error({ err: error }, "❌ Error checking stream status");
      return false;
    }
  }

  stop(): void {
    this.eventSubListener.stop();
  }
}
