/**
 * Telegram adapter using grammY
 */

import { Bot, Context } from "grammy";
import { BaseAdapter } from "./base.js";
import type { TelegramConfig, TelegramBotConfig, IncomingMessage, UserInfo, CommandContext, DmPolicy } from "../core/types.js";

const TELEGRAM_MAX_MESSAGE_LENGTH = 4096;

export interface TelegramAdapterOptions {
  botId?: string; // For multi-bot mode
  botToken: string;
  agentId?: string; // Direct agent binding
  dmPolicy?: DmPolicy;
  allowFrom?: string[];
}

export class TelegramAdapter extends BaseAdapter {
  readonly name = "telegram" as const;
  private bot: Bot;
  private botInfo: { username?: string } = {};
  private botId?: string; // For multi-bot chatKey format
  private agentId?: string; // Direct agent binding

  constructor(config: TelegramConfig | TelegramAdapterOptions) {
    // Handle both TelegramConfig (backward compat) and TelegramAdapterOptions (multi-bot)
    const baseConfig = {
      enabled: true,
      dmPolicy: ("dmPolicy" in config ? config.dmPolicy : undefined) ?? "pairing",
      allowFrom: ("allowFrom" in config ? config.allowFrom : undefined) ?? [],
    };
    super(baseConfig);

    const botToken = "botToken" in config ? config.botToken : undefined;
    if (!botToken) {
      throw new Error("Telegram botToken is required");
    }

    this.bot = new Bot(botToken);
    this.botId = "botId" in config ? config.botId : undefined;
    this.agentId = "agentId" in config ? config.agentId : undefined;
  }

  /**
   * Get the agent ID bound to this bot (for multi-bot mode)
   */
  getAgentId(): string | undefined {
    return this.agentId;
  }

  /**
   * Get the bot ID (for multi-bot mode)
   */
  getBotId(): string | undefined {
    return this.botId;
  }

  async start(): Promise<void> {
    // Get bot info
    const me = await this.bot.api.getMe();
    this.botInfo = { username: me.username };

    // Handle text messages
    this.bot.on("message:text", async (ctx) => {
      await this.handleMessage(ctx);
    });

    // Handle errors
    this.bot.catch((err) => {
      this.emitError(err.error instanceof Error ? err.error : new Error(String(err.error)));
    });

    // Start polling - use a promise that resolves when onStart fires
    // because bot.start() is a long-running operation that only resolves when stopped
    await new Promise<void>((resolve) => {
      this.bot.start({
        onStart: () => {
          resolve();
        },
      });
    });
  }

  async stop(): Promise<void> {
    await this.bot.stop();
  }

  async send(chatKey: string, text: string, options?: { replyTo?: string }): Promise<void> {
    const chatId = this.extractChatId(chatKey);
    const chunks = this.splitMessage(text, TELEGRAM_MAX_MESSAGE_LENGTH);

    for (const chunk of chunks) {
      await this.bot.api.sendMessage(chatId, chunk, {
        reply_to_message_id: options?.replyTo ? parseInt(options.replyTo, 10) : undefined,
        parse_mode: "Markdown",
      }).catch(async () => {
        // Retry without markdown if it fails
        await this.bot.api.sendMessage(chatId, chunk, {
          reply_to_message_id: options?.replyTo ? parseInt(options.replyTo, 10) : undefined,
        });
      });
    }
  }

  private async handleMessage(ctx: Context): Promise<void> {
    const message = ctx.message;
    if (!message || !message.text) return;

    const chat = message.chat;
    const from = message.from;
    if (!from) return;

    const isGroup = chat.type === "group" || chat.type === "supergroup";
    const chatKey = this.buildChatKey(chat.id, isGroup);

    const userInfo: UserInfo = {
      id: String(from.id),
      username: from.username,
      displayName: [from.first_name, from.last_name].filter(Boolean).join(" ") || undefined,
      channel: "telegram",
    };

    // Check if this is a command
    const parsed = this.parseCommand(message.text);
    if (parsed) {
      const commandCtx: CommandContext = {
        command: parsed.command,
        args: parsed.args,
        message: {
          chatKey,
          channel: "telegram",
          userId: String(from.id),
          text: message.text,
          userInfo,
          isGroup,
          groupId: isGroup ? String(chat.id) : undefined,
          replyTo: message.reply_to_message?.message_id?.toString(),
          timestamp: new Date(message.date * 1000),
        },
        reply: async (text: string) => {
          await this.send(chatKey, text, { replyTo: String(message.message_id) });
        },
      };

      await this.emitCommand(commandCtx);
      return;
    }

    // In groups, only respond if mentioned
    if (isGroup) {
      const botMention = `@${this.botInfo.username}`;
      if (!message.text.includes(botMention) && !message.reply_to_message) {
        // Not mentioned and not a reply, ignore
        return;
      }
    }

    const incomingMessage: IncomingMessage = {
      chatKey,
      channel: "telegram",
      userId: String(from.id),
      text: message.text.replace(`@${this.botInfo.username}`, "").trim(),
      userInfo,
      isGroup,
      groupId: isGroup ? String(chat.id) : undefined,
      replyTo: message.reply_to_message?.message_id?.toString(),
      timestamp: new Date(message.date * 1000),
    };

    await this.emitMessage(incomingMessage);
  }

  private buildChatKey(chatId: number, isGroup: boolean): string {
    // Multi-bot format: telegram:botId:chatId or telegram:botId:group:chatId
    // Single-bot format: telegram:chatId or telegram:group:chatId
    if (this.botId) {
      if (isGroup) {
        return `telegram:${this.botId}:group:${chatId}`;
      }
      return `telegram:${this.botId}:${chatId}`;
    }

    // Backward compatible format
    if (isGroup) {
      return `telegram:group:${chatId}`;
    }
    return `telegram:${chatId}`;
  }

  private extractChatId(chatKey: string): number {
    const parts = chatKey.split(":");
    // Formats:
    // telegram:123 (single bot, DM)
    // telegram:group:123 (single bot, group)
    // telegram:botId:123 (multi-bot, DM)
    // telegram:botId:group:123 (multi-bot, group)
    const idStr = parts[parts.length - 1];
    return parseInt(idStr, 10);
  }

  getBotUsername(): string | undefined {
    return this.botInfo.username;
  }

  /**
   * Create a TelegramAdapter from a TelegramBotConfig (for multi-bot mode)
   */
  static fromBotConfig(botConfig: TelegramBotConfig): TelegramAdapter {
    return new TelegramAdapter({
      botId: botConfig.id,
      botToken: botConfig.botToken,
      agentId: botConfig.agentId,
      dmPolicy: botConfig.dmPolicy,
      allowFrom: botConfig.allowFrom,
    });
  }
}
