/**
 * Base adapter interface for messaging platforms
 */

import type {
  Adapter,
  AdapterEvents,
  ChannelType,
  IncomingMessage,
  CommandContext,
  ChannelConfig,
} from "../core/types.js";

export type MessageHandler = (msg: IncomingMessage) => Promise<void>;
export type CommandHandler = (ctx: CommandContext) => Promise<void>;
export type ErrorHandler = (error: Error) => void;

export abstract class BaseAdapter implements Adapter {
  abstract readonly name: ChannelType;

  protected messageHandlers: MessageHandler[] = [];
  protected commandHandlers: CommandHandler[] = [];
  protected errorHandlers: ErrorHandler[] = [];
  protected config: ChannelConfig;

  constructor(config: ChannelConfig) {
    this.config = config;
  }

  abstract start(): Promise<void>;
  abstract stop(): Promise<void>;
  abstract send(chatKey: string, text: string, options?: { replyTo?: string }): Promise<void>;

  on<K extends keyof AdapterEvents>(event: K, handler: AdapterEvents[K]): void {
    switch (event) {
      case "message":
        this.messageHandlers.push(handler as MessageHandler);
        break;
      case "command":
        this.commandHandlers.push(handler as CommandHandler);
        break;
      case "error":
        this.errorHandlers.push(handler as ErrorHandler);
        break;
    }
  }

  protected async emitMessage(msg: IncomingMessage): Promise<void> {
    for (const handler of this.messageHandlers) {
      try {
        await handler(msg);
      } catch (error) {
        this.emitError(error instanceof Error ? error : new Error(String(error)));
      }
    }
  }

  protected async emitCommand(ctx: CommandContext): Promise<void> {
    for (const handler of this.commandHandlers) {
      try {
        await handler(ctx);
      } catch (error) {
        this.emitError(error instanceof Error ? error : new Error(String(error)));
      }
    }
  }

  protected emitError(error: Error): void {
    for (const handler of this.errorHandlers) {
      handler(error);
    }
  }

  /**
   * Parse a command from message text
   * Returns null if not a command
   */
  protected parseCommand(text: string): { command: string; args: string[] } | null {
    if (!text.startsWith("/")) {
      return null;
    }

    const parts = text.slice(1).split(/\s+/);
    const command = parts[0].toLowerCase();
    const args = parts.slice(1);

    return { command, args };
  }

  /**
   * Split long messages for platform limits
   */
  protected splitMessage(text: string, maxLength: number): string[] {
    if (text.length <= maxLength) {
      return [text];
    }

    const chunks: string[] = [];
    let remaining = text;

    while (remaining.length > 0) {
      if (remaining.length <= maxLength) {
        chunks.push(remaining);
        break;
      }

      // Find a good break point
      let breakPoint = maxLength;

      // Try to break at newline
      const newlineIndex = remaining.lastIndexOf("\n", maxLength);
      if (newlineIndex > maxLength * 0.5) {
        breakPoint = newlineIndex + 1;
      } else {
        // Try to break at space
        const spaceIndex = remaining.lastIndexOf(" ", maxLength);
        if (spaceIndex > maxLength * 0.5) {
          breakPoint = spaceIndex + 1;
        }
      }

      chunks.push(remaining.slice(0, breakPoint));
      remaining = remaining.slice(breakPoint);
    }

    return chunks;
  }
}
