/**
 * Discord adapter using discord.js
 */

import {
  Client,
  GatewayIntentBits,
  Partials,
  Message,
  TextChannel,
  DMChannel,
  NewsChannel,
  ThreadChannel,
} from "discord.js";
import { BaseAdapter } from "./base.js";
import type { DiscordConfig, DiscordBotConfig, IncomingMessage, UserInfo, CommandContext, DmPolicy } from "../core/types.js";

const DISCORD_MAX_MESSAGE_LENGTH = 2000;

type TextBasedChannel = TextChannel | DMChannel | NewsChannel | ThreadChannel;

export interface DiscordAdapterOptions {
  botId?: string; // For multi-bot mode
  token: string;
  applicationId?: string;
  agentId?: string; // Direct agent binding
  dmPolicy?: DmPolicy;
  allowFrom?: string[];
}

export class DiscordAdapter extends BaseAdapter {
  readonly name = "discord" as const;
  private client: Client;
  private discordConfig: DiscordConfig | DiscordAdapterOptions;
  private botId?: string; // For multi-bot chatKey format
  private agentId?: string; // Direct agent binding

  constructor(config: DiscordConfig | DiscordAdapterOptions) {
    // Handle both DiscordConfig (backward compat) and DiscordAdapterOptions (multi-bot)
    const baseConfig = {
      enabled: true,
      dmPolicy: config.dmPolicy ?? "pairing",
      allowFrom: config.allowFrom ?? [],
    };
    super(baseConfig);

    if (!config.token) {
      throw new Error("Discord token is required");
    }
    this.discordConfig = config;
    this.botId = "botId" in config ? config.botId : undefined;
    this.agentId = "agentId" in config ? config.agentId : undefined;

    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.MessageContent,
      ],
      partials: [Partials.Channel, Partials.Message],
    });
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
    // Handle messages
    this.client.on("messageCreate", async (message) => {
      await this.handleMessage(message);
    });

    // Handle errors
    this.client.on("error", (error) => {
      this.emitError(error);
    });

    // Login
    await this.client.login(this.discordConfig.token);

    console.log(`Discord bot ${this.client.user?.tag} started`);
  }

  async stop(): Promise<void> {
    this.client.destroy();
  }

  async send(chatKey: string, text: string, _options?: { replyTo?: string }): Promise<void> {
    const channelId = this.extractChannelId(chatKey);
    const channel = await this.client.channels.fetch(channelId);

    if (!channel || !this.isTextChannel(channel)) {
      throw new Error(`Cannot send to channel ${channelId}`);
    }

    const chunks = this.splitMessage(text, DISCORD_MAX_MESSAGE_LENGTH);

    for (const chunk of chunks) {
      await channel.send(chunk);
    }
  }

  private async handleMessage(message: Message): Promise<void> {
    // Ignore bot messages
    if (message.author.bot) return;

    const isDM = !message.guild;
    const chatKey = this.buildChatKey(message);

    const userInfo: UserInfo = {
      id: message.author.id,
      username: message.author.username,
      displayName: message.author.displayName || message.author.username,
      channel: "discord",
    };

    // Check if this is a command
    const parsed = this.parseCommand(message.content);
    if (parsed) {
      const commandCtx: CommandContext = {
        command: parsed.command,
        args: parsed.args,
        message: {
          chatKey,
          channel: "discord",
          userId: message.author.id,
          text: message.content,
          userInfo,
          isGroup: !isDM,
          groupId: message.guild?.id,
          replyTo: message.reference?.messageId,
          timestamp: message.createdAt,
        },
        reply: async (text: string) => {
          await message.reply(text);
        },
      };

      await this.emitCommand(commandCtx);
      return;
    }

    // In guilds, only respond if mentioned
    if (!isDM) {
      const mentioned = message.mentions.has(this.client.user!);
      const isReply = message.reference?.messageId !== undefined;

      if (!mentioned && !isReply) {
        return;
      }
    }

    // Clean mention from message
    let text = message.content;
    if (this.client.user) {
      text = text.replace(new RegExp(`<@!?${this.client.user.id}>`, "g"), "").trim();
    }

    const incomingMessage: IncomingMessage = {
      chatKey,
      channel: "discord",
      userId: message.author.id,
      text,
      userInfo,
      isGroup: !isDM,
      groupId: message.guild?.id,
      replyTo: message.reference?.messageId,
      timestamp: message.createdAt,
    };

    await this.emitMessage(incomingMessage);
  }

  private buildChatKey(message: Message): string {
    // Multi-bot format: discord:botId:channel:channelId or discord:botId:userId
    // Single-bot format: discord:channel:channelId or discord:userId
    if (this.botId) {
      if (message.guild) {
        return `discord:${this.botId}:channel:${message.channelId}`;
      }
      return `discord:${this.botId}:${message.author.id}`;
    }

    // Backward compatible format
    if (message.guild) {
      return `discord:channel:${message.channelId}`;
    }
    return `discord:${message.author.id}`;
  }

  private extractChannelId(chatKey: string): string {
    const parts = chatKey.split(":");
    // Formats:
    // discord:userId (single bot, DM)
    // discord:channel:channelId (single bot, guild)
    // discord:botId:userId (multi-bot, DM)
    // discord:botId:channel:channelId (multi-bot, guild)

    // Check for multi-bot guild channel format
    if (parts.includes("channel")) {
      const channelIdx = parts.indexOf("channel");
      return parts[channelIdx + 1];
    }

    // For DMs, return the last part (userId)
    return parts[parts.length - 1];
  }

  private isTextChannel(channel: unknown): channel is TextBasedChannel {
    return (
      channel !== null &&
      typeof channel === "object" &&
      "send" in channel &&
      typeof (channel as { send: unknown }).send === "function"
    );
  }

  getBotUser(): { id: string; tag: string } | undefined {
    if (!this.client.user) return undefined;
    return {
      id: this.client.user.id,
      tag: this.client.user.tag,
    };
  }

  /**
   * Create a DiscordAdapter from a DiscordBotConfig (for multi-bot mode)
   */
  static fromBotConfig(botConfig: DiscordBotConfig): DiscordAdapter {
    return new DiscordAdapter({
      botId: botConfig.id,
      token: botConfig.token,
      applicationId: botConfig.applicationId,
      agentId: botConfig.agentId,
      dmPolicy: botConfig.dmPolicy,
      allowFrom: botConfig.allowFrom,
    });
  }
}
