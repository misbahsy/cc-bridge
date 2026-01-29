/**
 * Bot management commands - add, list, remove bots without editing config
 */

import chalk from "chalk";
import { configExists, loadConfigSafe, saveConfig } from "../../config/loader.js";
import type { BridgeConfig, TelegramBotConfig, DiscordBotConfig } from "../../core/types.js";

interface AddBotOptions {
  token: string;
  agent?: string;
  dmPolicy?: string;
}

export async function addBot(channel: string, id: string, options: AddBotOptions): Promise<void> {
  if (!configExists()) {
    console.log(chalk.red("No config found. Run:"));
    console.log(chalk.bold("  ccb setup"));
    return;
  }

  const result = loadConfigSafe();
  if (!result.success) {
    console.log(chalk.red("Config error:"), result.error);
    return;
  }

  const config = result.config as BridgeConfig;

  // Validate channel
  if (channel !== "telegram" && channel !== "discord") {
    console.log(chalk.red(`Invalid channel: ${channel}`));
    console.log(chalk.gray("Supported channels: telegram, discord"));
    return;
  }

  // Validate agent if specified
  if (options.agent) {
    const agentExists = config.agents.list.find(a => a.id === options.agent);
    if (!agentExists) {
      console.log(chalk.red(`Agent "${options.agent}" not found.`));
      console.log(chalk.gray("Use 'ccb agent list' to see available agents."));
      console.log(chalk.gray("Or 'ccb agent add' to create one first."));
      return;
    }
  }

  if (channel === "telegram") {
    await addTelegramBot(config, id, options);
  } else if (channel === "discord") {
    await addDiscordBot(config, id, options);
  }
}

async function addTelegramBot(config: BridgeConfig, id: string, options: AddBotOptions): Promise<void> {
  // Initialize telegram config if needed
  if (!config.channels.telegram) {
    config.channels.telegram = {
      enabled: true,
      dmPolicy: "pairing",
      allowFrom: [],
      bots: [],
    };
  }

  // Migrate from single-bot to multi-bot if needed
  if (config.channels.telegram.botToken && !config.channels.telegram.bots) {
    console.log(chalk.yellow("Migrating from single-bot to multi-bot configuration..."));
    config.channels.telegram.bots = [{
      id: "default",
      botToken: config.channels.telegram.botToken,
      dmPolicy: config.channels.telegram.dmPolicy,
      allowFrom: config.channels.telegram.allowFrom,
    }];
    delete (config.channels.telegram as unknown as Record<string, unknown>).botToken;
  }

  // Initialize bots array if needed
  if (!config.channels.telegram.bots) {
    config.channels.telegram.bots = [];
  }

  // Check if bot ID already exists
  const existing = config.channels.telegram.bots.find(b => b.id === id);
  if (existing) {
    console.log(chalk.red(`Bot "${id}" already exists.`));
    console.log(chalk.gray("Use 'ccb bot remove telegram <id>' first, or choose a different ID."));
    return;
  }

  // Create new bot config
  const newBot: TelegramBotConfig = {
    id,
    botToken: options.token,
  };

  if (options.agent) newBot.agentId = options.agent;
  if (options.dmPolicy) newBot.dmPolicy = options.dmPolicy as "pairing" | "allowlist" | "open";

  // Add to config
  config.channels.telegram.bots.push(newBot);
  config.channels.telegram.enabled = true;

  // Save config
  saveConfig(config);

  console.log(chalk.green(`✓ Telegram bot "${id}" added successfully!`));
  console.log();
  console.log(chalk.cyan("Bot details:"));
  console.log(`  ID: ${newBot.id}`);
  console.log(`  Token: ${newBot.botToken.slice(0, 10)}...`);
  if (newBot.agentId) console.log(`  Agent: ${newBot.agentId}`);
  if (newBot.dmPolicy) console.log(`  DM Policy: ${newBot.dmPolicy}`);
  console.log();
  console.log(chalk.yellow("Restart the bridge to connect the new bot:"));
  console.log(chalk.bold("  ccb start"));
}

async function addDiscordBot(config: BridgeConfig, id: string, options: AddBotOptions): Promise<void> {
  // Initialize discord config if needed
  if (!config.channels.discord) {
    config.channels.discord = {
      enabled: true,
      dmPolicy: "pairing",
      allowFrom: [],
      bots: [],
    };
  }

  // Migrate from single-bot to multi-bot if needed
  if (config.channels.discord.token && !config.channels.discord.bots) {
    console.log(chalk.yellow("Migrating from single-bot to multi-bot configuration..."));
    config.channels.discord.bots = [{
      id: "default",
      token: config.channels.discord.token,
      applicationId: config.channels.discord.applicationId,
      dmPolicy: config.channels.discord.dmPolicy,
      allowFrom: config.channels.discord.allowFrom,
    }];
    delete (config.channels.discord as unknown as Record<string, unknown>).token;
    delete (config.channels.discord as unknown as Record<string, unknown>).applicationId;
  }

  // Initialize bots array if needed
  if (!config.channels.discord.bots) {
    config.channels.discord.bots = [];
  }

  // Check if bot ID already exists
  const existing = config.channels.discord.bots.find(b => b.id === id);
  if (existing) {
    console.log(chalk.red(`Bot "${id}" already exists.`));
    console.log(chalk.gray("Use 'ccb bot remove discord <id>' first."));
    return;
  }

  // Create new bot config
  const newBot: DiscordBotConfig = {
    id,
    token: options.token,
  };

  if (options.agent) newBot.agentId = options.agent;
  if (options.dmPolicy) newBot.dmPolicy = options.dmPolicy as "pairing" | "allowlist" | "open";

  // Add to config
  config.channels.discord.bots.push(newBot);
  config.channels.discord.enabled = true;

  // Save config
  saveConfig(config);

  console.log(chalk.green(`✓ Discord bot "${id}" added successfully!`));
  console.log();
  console.log(chalk.yellow("Restart the bridge to connect the new bot:"));
  console.log(chalk.bold("  ccb start"));
}

export async function listBots(): Promise<void> {
  if (!configExists()) {
    console.log(chalk.red("No config found. Run:"));
    console.log(chalk.bold("  ccb setup"));
    return;
  }

  const result = loadConfigSafe();
  if (!result.success) {
    console.log(chalk.red("Config error:"), result.error);
    return;
  }

  const config = result.config as BridgeConfig;

  console.log(chalk.cyan("\n🤖 Configured Bots\n"));

  let hasBots = false;

  // Telegram bots
  if (config.channels.telegram?.enabled) {
    if (config.channels.telegram.bots?.length) {
      console.log(chalk.bold("Telegram:"));
      for (const bot of config.channels.telegram.bots) {
        console.log(`  • ${bot.id}`);
        console.log(`    Token: ${bot.botToken.slice(0, 10)}...`);
        if (bot.agentId) console.log(`    Agent: ${bot.agentId}`);
        if (bot.dmPolicy) console.log(`    Policy: ${bot.dmPolicy}`);
      }
      console.log();
      hasBots = true;
    } else if (config.channels.telegram.botToken) {
      console.log(chalk.bold("Telegram:"));
      console.log(`  • default (single-bot mode)`);
      console.log(`    Token: ${config.channels.telegram.botToken.slice(0, 10)}...`);
      console.log();
      hasBots = true;
    }
  }

  // Discord bots
  if (config.channels.discord?.enabled) {
    if (config.channels.discord.bots?.length) {
      console.log(chalk.bold("Discord:"));
      for (const bot of config.channels.discord.bots) {
        console.log(`  • ${bot.id}`);
        console.log(`    Token: ${bot.token.slice(0, 10)}...`);
        if (bot.agentId) console.log(`    Agent: ${bot.agentId}`);
        if (bot.dmPolicy) console.log(`    Policy: ${bot.dmPolicy}`);
      }
      console.log();
      hasBots = true;
    } else if (config.channels.discord.token) {
      console.log(chalk.bold("Discord:"));
      console.log(`  • default (single-bot mode)`);
      console.log(`    Token: ${config.channels.discord.token.slice(0, 10)}...`);
      console.log();
      hasBots = true;
    }
  }

  if (!hasBots) {
    console.log(chalk.gray("No bots configured."));
    console.log(chalk.gray("Add one with: ccb bot add telegram <id> --token <TOKEN>"));
  }
}

export async function removeBot(channel: string, id: string): Promise<void> {
  if (!configExists()) {
    console.log(chalk.red("No config found."));
    return;
  }

  const result = loadConfigSafe();
  if (!result.success) {
    console.log(chalk.red("Config error:"), result.error);
    return;
  }

  const config = result.config as BridgeConfig;

  if (channel === "telegram") {
    if (!config.channels.telegram?.bots) {
      console.log(chalk.red("No Telegram bots configured in multi-bot mode."));
      return;
    }

    const index = config.channels.telegram.bots.findIndex(b => b.id === id);
    if (index === -1) {
      console.log(chalk.red(`Bot "${id}" not found.`));
      return;
    }

    config.channels.telegram.bots.splice(index, 1);

    // Disable telegram if no bots left
    if (config.channels.telegram.bots.length === 0) {
      config.channels.telegram.enabled = false;
    }

    saveConfig(config);
    console.log(chalk.green(`✓ Telegram bot "${id}" removed.`));

  } else if (channel === "discord") {
    if (!config.channels.discord?.bots) {
      console.log(chalk.red("No Discord bots configured in multi-bot mode."));
      return;
    }

    const index = config.channels.discord.bots.findIndex(b => b.id === id);
    if (index === -1) {
      console.log(chalk.red(`Bot "${id}" not found.`));
      return;
    }

    config.channels.discord.bots.splice(index, 1);

    if (config.channels.discord.bots.length === 0) {
      config.channels.discord.enabled = false;
    }

    saveConfig(config);
    console.log(chalk.green(`✓ Discord bot "${id}" removed.`));

  } else {
    console.log(chalk.red(`Invalid channel: ${channel}`));
    return;
  }

  console.log(chalk.yellow("Restart the bridge for changes to take effect."));
}
