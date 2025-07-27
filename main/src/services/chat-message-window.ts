import type { ChatMessage } from './chat-listener.service';

interface ChatMessageWithExpiration extends ChatMessage {
  expiration: number;
}

const TEN_MINUTES = 1000 * 60 * 10;
const MAX_MESSAGES = 10;

export class ChatMessageWindow {
  private readonly messages_: ChatMessageWithExpiration[] = [];
  private readonly maxMessages: number;
  private readonly messageExpirationDuration: number;

  constructor(
    maxMessages = MAX_MESSAGES,
    messageExpirationDuration = TEN_MINUTES
  ) {
    this.maxMessages = maxMessages;
    this.messageExpirationDuration = messageExpirationDuration;
  }

  get messages(): ChatMessageWithExpiration[] {
    this.cleanupExpiredMessages();

    return this.messages_;
  }

  addMessage(message: ChatMessage): void {
    const messageWithExpiration = this.createMessageWithExpiration(message);

    this.messages_.push(messageWithExpiration);
    if (this.messages_.length > this.maxMessages) {
      this.messages_.shift();
    }

    this.cleanupExpiredMessages();
  }

  private createMessageWithExpiration(
    message: ChatMessage
  ): ChatMessageWithExpiration {
    return {
      ...message,
      expiration: Date.now() + this.messageExpirationDuration,
    };
  }

  private cleanupExpiredMessages(): void {
    for (const message of this.messages_) {
      const shouldRemove = message.expiration < Date.now();

      if (!shouldRemove) {
        break; // if a message is not expired, then all subsequent messages are not expired
      }

      this.messages_.splice(this.messages_.indexOf(message), 1);
    }
  }
}
