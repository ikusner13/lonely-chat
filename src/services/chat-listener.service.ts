import { ChatClient, type ChatUser } from '@twurple/chat';
import { EventEmitter } from 'tseep';
import { env } from '@/env';
import { createLogger } from '@/utils/logger';

export const ROLES = {
  moderator: 'moderator',
  broadcaster: 'broadcaster',
  user: 'user',
} as const;

export type Role = (typeof ROLES)[keyof typeof ROLES];

export interface ChatMessage {
  user: string;
  message: string;
  role: Role;
}

export class ChatListenerService extends EventEmitter<{
  message: (message: ChatMessage) => void;
}> {
  private readonly client: ChatClient;
  private readonly logger = createLogger('ChatListenerService');

  constructor() {
    super();

    this.client = new ChatClient({
      channels: [env.TWITCH_CHANNEL_NAME],
    });
  }

  start(): void {
    this.logger.info('👂 Chat listener started');
    this.client.connect();
    this.handleMessage();
  }

  stop(): void {
    this.logger.info('🔇 Chat listener stopped');
    this.client.quit();
    this.removeAllListeners('message');
  }

  private handleMessage(): void {
    this.client.onMessage((_channel, user, message, msg) => {
      this.emit('message', {
        user,
        message,
        role: this.determineRole(msg.userInfo),
      });
    });
  }

  private determineRole(userInfo: ChatUser): Role {
    switch (true) {
      case userInfo.isMod:
        return ROLES.moderator;
      case userInfo.isBroadcaster:
        return ROLES.broadcaster;
      default:
        return ROLES.user;
    }
  }
}
