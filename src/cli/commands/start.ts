/**
 * Start command - launches the bridge
 */

import chalk from "chalk";
import ora from "ora";
import { loadConfigSafe, configExists } from "../../config/loader.js";
import { getDatabase, closeDatabase } from "../../db/sqlite.js";
import { SessionManager } from "../../core/session-manager.js";
import { PairingManager } from "../../security/pairing.js";
import { AllowlistManager } from "../../security/allowlist.js";
import { CommandParser } from "../../commands/parser.js";
import { createSessionCommands } from "../../commands/handlers/session.js";
import { createStatusCommands } from "../../commands/handlers/status.js";
import { createSettingsCommands } from "../../commands/handlers/settings.js";
import { createControlCommands } from "../../commands/handlers/control.js";
import { createDiscoveryCommands } from "../../commands/handlers/discovery.js";
import { TelegramAdapter } from "../../adapters/telegram.js";
import { DiscordAdapter } from "../../adapters/discord.js";
import { createWebhookServer } from "../../webhooks/server.js";
import { MessageLogger } from "../../core/logger.js";
import { createControlAPI } from "../../core/control-api.js";
import type { Adapter, IncomingMessage, CommandContext, BridgeConfig, ChannelConfig, ChannelType, DmPolicy } from "../../core/types.js";

// Extended adapter interface for multi-bot support
interface ExtendedAdapter extends Adapter {
  getAgentId?: () => string | undefined;
  getBotId?: () => string | undefined;
}

// Adapter-specific config that may override channel defaults
interface AdapterBotConfig {
  dmPolicy?: DmPolicy;
  allowFrom?: string[];
  agentId?: string;
}

// Helper to get channel config safely (handles webhook type which isn't in config)
function getChannelConfig(config: BridgeConfig, channel: ChannelType): ChannelConfig | undefined {
  if (channel === "telegram") return config.channels.telegram;
  if (channel === "discord") return config.channels.discord;
  return undefined;
}

interface StartOptions {
  daemon?: boolean;
  config?: string;
}

export async function runStart(options: StartOptions): Promise<void> {
  // Check for daemon mode
  if (options.daemon) {
    console.log(chalk.yellow("Daemon mode requires PM2. Run:"));
    console.log(chalk.bold("  pm2 start ccb -- start"));
    return;
  }

  // Load config
  if (!configExists()) {
    console.log(chalk.red("No config found. Run:"));
    console.log(chalk.bold("  ccb setup"));
    return;
  }

  const configResult = loadConfigSafe();
  if (!configResult.success) {
    console.log(chalk.red("Config error:"), configResult.error);
    return;
  }

  const config = configResult.config;
  console.log(chalk.cyan("\n🚀 Starting ccb...\n"));

  // Initialize database
  const db = getDatabase();

  // Initialize managers
  const sessionManager = new SessionManager(config, db);
  const pairingManager = new PairingManager(db);
  const allowlistManager = new AllowlistManager(db);

  // Initialize message logger if enabled
  let logger: MessageLogger | undefined;
  if (config.logging?.enabled) {
    logger = new MessageLogger(config.logging);
    console.log(chalk.gray(`Logging to ${config.logging.path}`));
  }

  // Initialize command parser
  const commandParser = new CommandParser();
  registerCommands(commandParser, sessionManager);

  // Start adapters
  const adapters = new Map<string, ExtendedAdapter>();
  const spinner = ora();

  // Create shutdown handler (will be set up after all services start)
  let shutdownHandler: (() => Promise<void>) | undefined;

  // Initialize Control API for desktop app
  const controlAPI = createControlAPI({
    config,
    db,
    pairingManager,
    allowlistManager,
    sessionManager,
    onStop: async () => {
      if (shutdownHandler) {
        await shutdownHandler();
      }
    },
  });

  // Start Control API
  spinner.start("Starting Control API...");
  try {
    await controlAPI.start();
    spinner.succeed(`Control API: http://127.0.0.1:${controlAPI.getPort()}`);
  } catch (error) {
    spinner.fail(`Control API: ${error instanceof Error ? error.message : String(error)}`);
  }

  // Telegram - support both single-bot and multi-bot modes
  if (config.channels.telegram?.enabled) {
    const telegramConfig = config.channels.telegram;

    if (telegramConfig.bots && telegramConfig.bots.length > 0) {
      // Multi-bot mode
      for (const botConfig of telegramConfig.bots) {
        spinner.start(`Connecting to Telegram (${botConfig.id})...`);
        try {
          const telegram = TelegramAdapter.fromBotConfig(botConfig);
          const adapterConfig: AdapterBotConfig = {
            dmPolicy: botConfig.dmPolicy ?? telegramConfig.dmPolicy,
            allowFrom: botConfig.allowFrom ?? telegramConfig.allowFrom,
            agentId: botConfig.agentId,
          };
          setupAdapter(telegram, config, sessionManager, pairingManager, allowlistManager, commandParser, adapterConfig, logger);
          await telegram.start();
          adapters.set(`telegram:${botConfig.id}`, telegram);
          // Update Control API with bot status
          const existingTelegramStatus = controlAPI['channelStatuses'].get('telegram');
          controlAPI.updateChannelStatus('telegram', {
            enabled: true,
            connected: true,
            botCount: (existingTelegramStatus?.bots?.length || 0) + 1,
            bots: [...(existingTelegramStatus?.bots || []), { id: botConfig.id, username: telegram.getBotUsername(), agentId: botConfig.agentId }],
          });
          spinner.succeed(`Telegram: @${telegram.getBotUsername()} [${botConfig.id}] (ready)`);
        } catch (error) {
          spinner.fail(`Telegram (${botConfig.id}): ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    } else if (telegramConfig.botToken) {
      // Single-bot mode (backward compat)
      spinner.start("Connecting to Telegram...");
      try {
        const telegram = new TelegramAdapter(telegramConfig);
        setupAdapter(telegram, config, sessionManager, pairingManager, allowlistManager, commandParser, undefined, logger);
        await telegram.start();
        adapters.set("telegram", telegram);
        controlAPI.updateChannelStatus('telegram', {
          enabled: true,
          connected: true,
          botCount: 1,
          bots: [{ id: 'default', username: telegram.getBotUsername() }],
        });
        spinner.succeed(`Telegram: @${telegram.getBotUsername()} (ready)`);
      } catch (error) {
        spinner.fail(`Telegram: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  // Discord - support both single-bot and multi-bot modes
  if (config.channels.discord?.enabled) {
    const discordConfig = config.channels.discord;

    if (discordConfig.bots && discordConfig.bots.length > 0) {
      // Multi-bot mode
      for (const botConfig of discordConfig.bots) {
        spinner.start(`Connecting to Discord (${botConfig.id})...`);
        try {
          const discord = DiscordAdapter.fromBotConfig(botConfig);
          const adapterConfig: AdapterBotConfig = {
            dmPolicy: botConfig.dmPolicy ?? discordConfig.dmPolicy,
            allowFrom: botConfig.allowFrom ?? discordConfig.allowFrom,
            agentId: botConfig.agentId,
          };
          setupAdapter(discord, config, sessionManager, pairingManager, allowlistManager, commandParser, adapterConfig, logger);
          await discord.start();
          adapters.set(`discord:${botConfig.id}`, discord);
          const botUser = discord.getBotUser();
          // Update Control API with bot status
          const existingDiscordStatus = controlAPI['channelStatuses'].get('discord');
          controlAPI.updateChannelStatus('discord', {
            enabled: true,
            connected: true,
            botCount: (existingDiscordStatus?.bots?.length || 0) + 1,
            bots: [...(existingDiscordStatus?.bots || []), { id: botConfig.id, username: botUser?.tag, agentId: botConfig.agentId }],
          });
          spinner.succeed(`Discord: ${botUser?.tag || "unknown"} [${botConfig.id}] (ready)`);
        } catch (error) {
          spinner.fail(`Discord (${botConfig.id}): ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    } else if (discordConfig.token) {
      // Single-bot mode (backward compat)
      spinner.start("Connecting to Discord...");
      try {
        const discord = new DiscordAdapter(discordConfig);
        setupAdapter(discord, config, sessionManager, pairingManager, allowlistManager, commandParser, undefined, logger);
        await discord.start();
        adapters.set("discord", discord);
        const botUser = discord.getBotUser();
        controlAPI.updateChannelStatus('discord', {
          enabled: true,
          connected: true,
          botCount: 1,
          bots: [{ id: 'default', username: botUser?.tag }],
        });
        spinner.succeed(`Discord: ${botUser?.tag || "unknown"} (ready)`);
      } catch (error) {
        spinner.fail(`Discord: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  // Start webhook server
  const webhookServer = createWebhookServer(config, sessionManager, adapters);
  if (webhookServer) {
    spinner.start("Starting webhook server...");
    try {
      await webhookServer.start();
      spinner.succeed(`Webhooks: http://${config.hooks?.bind}:${config.hooks?.port}`);
    } catch (error) {
      spinner.fail(`Webhooks: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // Summary
  console.log(chalk.green("\n✓ Bridge is running!"));
  console.log(chalk.cyan("\nSend a message to your bot to start chatting."));
  console.log(chalk.gray("Press Ctrl+C to stop.\n"));

  // Handle shutdown
  const shutdown = async (signal: string) => {
    console.log(chalk.yellow(`\nReceived ${signal}. Shutting down...`));

    // Stop Control API
    try {
      await controlAPI.stop();
      console.log(chalk.gray("Stopped Control API"));
    } catch (error) {
      console.error("Error stopping Control API:", error);
    }

    // Stop adapters
    for (const [name, adapter] of adapters) {
      try {
        await adapter.stop();
        console.log(chalk.gray(`Stopped ${name}`));
      } catch (error) {
        console.error(`Error stopping ${name}:`, error);
      }
    }

    // Stop webhook server
    if (webhookServer) {
      await webhookServer.stop();
    }

    // Close logger
    if (logger) {
      await logger.close();
    }

    // Close database
    closeDatabase();

    console.log(chalk.green("Goodbye!"));
    process.exit(0);
  };

  // Set the shutdown handler for Control API
  shutdownHandler = () => shutdown("API");

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

function registerCommands(parser: CommandParser, sessionManager: SessionManager): void {
  // Session commands
  for (const cmd of createSessionCommands(sessionManager)) {
    parser.register(cmd);
  }

  // Status commands
  for (const cmd of createStatusCommands(sessionManager, parser)) {
    parser.register(cmd);
  }

  // Settings commands
  for (const cmd of createSettingsCommands(sessionManager)) {
    parser.register(cmd);
  }

  // Control commands
  for (const cmd of createControlCommands(sessionManager)) {
    parser.register(cmd);
  }

  // Discovery commands (/skills, /plugins, /mcp, /agents)
  for (const cmd of createDiscoveryCommands(sessionManager)) {
    parser.register(cmd);
  }
}

function setupAdapter(
  adapter: ExtendedAdapter,
  config: BridgeConfig,
  sessionManager: SessionManager,
  pairingManager: PairingManager,
  allowlistManager: AllowlistManager,
  commandParser: CommandParser,
  botConfig?: AdapterBotConfig,
  logger?: MessageLogger
): void {
  // Get effective config (bot-specific overrides channel defaults)
  const getEffectiveConfig = (channel: ChannelType): { dmPolicy: DmPolicy; allowFrom: string[] } => {
    const channelConfig = getChannelConfig(config, channel);
    return {
      dmPolicy: botConfig?.dmPolicy ?? channelConfig?.dmPolicy ?? "pairing",
      allowFrom: botConfig?.allowFrom ?? channelConfig?.allowFrom ?? [],
    };
  };

  // Get agent ID for routing (bot-specific or use router)
  const getBoundAgentId = (): string | undefined => {
    return botConfig?.agentId ?? adapter.getAgentId?.();
  };

  // Handle commands
  adapter.on("command", async (ctx: CommandContext) => {
    // Check access first
    const effectiveConfig = getEffectiveConfig(ctx.message.channel);
    const accessResult = allowlistManager.isAllowed(
      ctx.message.chatKey,
      ctx.message.userInfo,
      { enabled: true, ...effectiveConfig }
    );

    if (!accessResult.allowed) {
      // Generate pairing code if policy is pairing
      if (effectiveConfig.dmPolicy === "pairing") {
        const code = pairingManager.generateCode(ctx.message.chatKey, ctx.message.userInfo);
        await ctx.reply(
          `🔐 Pairing required\n\n` +
          `Your code: ${code}\n\n` +
          `Run: ccb pairing approve ${code}\n\n` +
          `Code expires in 1 hour.`
        );
      } else {
        await ctx.reply(`Access denied: ${accessResult.reason}`);
      }
      return;
    }

    // Log command if logger is enabled
    if (logger) {
      logger.log({
        chatKey: ctx.message.chatKey,
        direction: "incoming",
        messageType: "command",
        content: `/${ctx.command} ${ctx.args.join(" ")}`.trim(),
        agentId: getBoundAgentId(),
      });
    }

    // Execute command
    const handled = await commandParser.execute(ctx);
    if (!handled) {
      await ctx.reply(`Unknown command: /${ctx.command}\nUse /help for available commands.`);
    }
  });

  // Handle messages
  adapter.on("message", async (msg: IncomingMessage) => {
    // Check access
    const effectiveConfig = getEffectiveConfig(msg.channel);
    const accessResult = allowlistManager.isAllowed(
      msg.chatKey,
      msg.userInfo,
      { enabled: true, ...effectiveConfig }
    );

    if (!accessResult.allowed) {
      // Generate pairing code if policy is pairing
      if (effectiveConfig.dmPolicy === "pairing") {
        const code = pairingManager.generateCode(msg.chatKey, msg.userInfo);
        await adapter.send(
          msg.chatKey,
          `🔐 Pairing required\n\n` +
          `Your code: ${code}\n\n` +
          `Run: ccb pairing approve ${code}\n\n` +
          `Code expires in 1 hour.`
        );
      }
      return;
    }

    // Log incoming message if logger is enabled
    const boundAgentId = getBoundAgentId();
    if (logger) {
      logger.log({
        chatKey: msg.chatKey,
        direction: "incoming",
        messageType: "text",
        content: msg.text,
        agentId: boundAgentId,
      });
    }

    // Stream response from Claude
    const chunks: string[] = [];
    let lastSendTime = Date.now();

    try {
      // Use bot-bound agent if specified
      const messageOptions = boundAgentId ? { agentId: boundAgentId } : undefined;

      for await (const chunk of sessionManager.sendMessage(msg, messageOptions)) {
        if (chunk.type === "text" && chunk.text) {
          chunks.push(chunk.text);

          // Send partial messages for long responses (every 2 seconds)
          const now = Date.now();
          if (chunks.join("").length > 3000 || now - lastSendTime > 2000) {
            if (chunks.length > 0) {
              const partialResponse = chunks.join("");
              await adapter.send(msg.chatKey, partialResponse);

              // Log partial response
              if (logger) {
                logger.log({
                  chatKey: msg.chatKey,
                  direction: "outgoing",
                  messageType: "text",
                  content: partialResponse,
                  agentId: boundAgentId,
                });
              }

              chunks.length = 0;
              lastSendTime = now;
            }
          }
        } else if (chunk.type === "tool_use") {
          // Log tool use
          if (logger) {
            logger.log({
              chatKey: msg.chatKey,
              direction: "outgoing",
              messageType: "tool_use",
              content: chunk.toolName || "unknown",
              agentId: boundAgentId,
            });
          }
        } else if (chunk.type === "error") {
          await adapter.send(msg.chatKey, `Error: ${chunk.error}`);
          return;
        }
      }

      // Send remaining text
      if (chunks.length > 0) {
        const finalResponse = chunks.join("");
        await adapter.send(msg.chatKey, finalResponse);

        // Log final response
        if (logger) {
          logger.log({
            chatKey: msg.chatKey,
            direction: "outgoing",
            messageType: "text",
            content: finalResponse,
            agentId: boundAgentId,
          });
        }
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      await adapter.send(msg.chatKey, `Error: ${errorMsg}`);
    }
  });

  // Handle errors
  adapter.on("error", (error: Error) => {
    const botId = adapter.getBotId?.();
    const prefix = botId ? `[${adapter.name}:${botId}]` : `[${adapter.name}]`;
    console.error(chalk.red(`${prefix} Error:`), error.message);
  });
}
