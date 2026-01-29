/**
 * Interactive setup wizard
 */

import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { homedir } from "node:os";
import { join } from "node:path";
import { existsSync, mkdirSync } from "node:fs";
import chalk from "chalk";
import {
  configExists,
  saveConfig,
  getConfigPath,
  createDefaultConfig,
  ensureConfigDir,
} from "../../config/loader.js";
import type { BridgeConfigOutput } from "../../config/schema.js";
import type { TelegramConfig, DiscordConfig, HooksConfig } from "../../core/types.js";

export async function runSetup(): Promise<void> {
  const rl = createInterface({ input, output });

  console.log(chalk.bold("\n🚀 Welcome to ccb setup!\n"));

  // Check if config already exists
  if (configExists()) {
    const overwrite = await rl.question(
      "Config already exists. Overwrite? (y/N): "
    );
    if (overwrite.toLowerCase() !== "y") {
      console.log("Setup cancelled.");
      rl.close();
      return;
    }
  }

  // Ensure config directory exists
  ensureConfigDir();

  // Start with default config
  const config: BridgeConfigOutput = createDefaultConfig();

  // Configure workspace
  console.log(chalk.cyan("\n📁 Workspace Configuration\n"));
  const defaultWorkspace = join(homedir(), "claude-workspace");
  const workspace = await rl.question(
    `Default workspace path [${defaultWorkspace}]: `
  );
  config.agents.list[0].workspace = workspace || defaultWorkspace;

  // Ensure workspace exists
  if (!existsSync(config.agents.list[0].workspace)) {
    const create = await rl.question(
      "Workspace directory doesn't exist. Create it? (Y/n): "
    );
    if (create.toLowerCase() !== "n") {
      mkdirSync(config.agents.list[0].workspace, { recursive: true });
      console.log(chalk.green(`✓ Created ${config.agents.list[0].workspace}`));
    }
  }

  // Configure platforms
  console.log(chalk.cyan("\n📱 Platform Configuration\n"));
  console.log("Which platforms do you want to enable?\n");

  // Telegram
  const enableTelegram = await rl.question("Enable Telegram? (Y/n): ");
  if (enableTelegram.toLowerCase() !== "n") {
    const telegramConfig = await configureTelegram(rl);
    if (telegramConfig) {
      config.channels.telegram = telegramConfig;
    }
  }

  // Discord
  const enableDiscord = await rl.question("Enable Discord? (y/N): ");
  if (enableDiscord.toLowerCase() === "y") {
    const discordConfig = await configureDiscord(rl);
    if (discordConfig) {
      config.channels.discord = discordConfig;
    }
  }

  // Configure webhooks
  console.log(chalk.cyan("\n🔗 Webhook Configuration\n"));
  const enableWebhooks = await rl.question(
    "Enable webhook server for external events (Gmail, GitHub, etc.)? (y/N): "
  );
  if (enableWebhooks.toLowerCase() === "y") {
    const hooksConfig = await configureWebhooks(rl);
    if (hooksConfig) {
      config.hooks = hooksConfig;
    }
  }

  // Save config
  saveConfig(config);

  console.log(chalk.green(`\n✓ Config saved to ${getConfigPath()}`));
  console.log(chalk.cyan("\nNext steps:"));
  console.log("  1. Review your config:", chalk.bold(getConfigPath()));
  console.log("  2. Start the bridge:", chalk.bold("ccb start"));
  console.log("  3. Send a message to your bot to start chatting!\n");

  rl.close();
}

async function configureTelegram(
  rl: ReturnType<typeof createInterface>
): Promise<TelegramConfig | null> {
  console.log(chalk.yellow("\nTo create a Telegram bot:"));
  console.log("  1. Message @BotFather on Telegram");
  console.log("  2. Send /newbot and follow the prompts");
  console.log("  3. Copy the bot token\n");

  const token = await rl.question("Telegram Bot Token: ");
  if (!token) {
    console.log(chalk.yellow("Skipping Telegram (no token provided)"));
    return null;
  }

  console.log("\nSecurity mode:");
  console.log("  1. pairing (recommended) - Users must approve via pairing code");
  console.log("  2. allowlist - Only pre-configured users can access");
  console.log("  3. open - Anyone can use the bot (not recommended)\n");

  const policyInput = await rl.question("Security mode [1]: ");
  const policyMap: Record<string, "pairing" | "allowlist" | "open"> = {
    "1": "pairing",
    "2": "allowlist",
    "3": "open",
    "": "pairing",
    pairing: "pairing",
    allowlist: "allowlist",
    open: "open",
  };
  const dmPolicy = policyMap[policyInput] || "pairing";

  let allowFrom: string[] = [];
  if (dmPolicy === "allowlist") {
    const users = await rl.question(
      "Allowed user IDs (comma-separated): "
    );
    allowFrom = users.split(",").map((s) => s.trim()).filter(Boolean);
  }

  return {
    enabled: true,
    botToken: token,
    dmPolicy,
    allowFrom,
  };
}

async function configureDiscord(
  rl: ReturnType<typeof createInterface>
): Promise<DiscordConfig | null> {
  console.log(chalk.yellow("\nTo create a Discord bot:"));
  console.log("  1. Go to https://discord.com/developers/applications");
  console.log("  2. Create a new application");
  console.log("  3. Go to Bot section and create a bot");
  console.log("  4. Copy the bot token");
  console.log("  5. Enable MESSAGE CONTENT INTENT in Bot settings\n");

  const token = await rl.question("Discord Bot Token: ");
  if (!token) {
    console.log(chalk.yellow("Skipping Discord (no token provided)"));
    return null;
  }

  console.log("\nSecurity mode:");
  console.log("  1. pairing (recommended) - Users must approve via pairing code");
  console.log("  2. allowlist - Only pre-configured users can access\n");

  const policyInput = await rl.question("Security mode [1]: ");
  const dmPolicy = policyInput === "2" ? "allowlist" : "pairing";

  let allowFrom: string[] = [];
  if (dmPolicy === "allowlist") {
    const users = await rl.question(
      "Allowed user IDs (comma-separated): "
    );
    allowFrom = users.split(",").map((s) => s.trim()).filter(Boolean);
  }

  return {
    enabled: true,
    token,
    dmPolicy,
    allowFrom,
  };
}

async function configureWebhooks(
  rl: ReturnType<typeof createInterface>
): Promise<HooksConfig | null> {
  const port = await rl.question("Webhook port [38791]: ");
  const bind = await rl.question("Bind address [127.0.0.1]: ");

  // Generate a random token
  const crypto = await import("node:crypto");
  const defaultToken = crypto.randomBytes(16).toString("hex");
  const token = await rl.question(`Webhook token [${defaultToken}]: `);

  return {
    enabled: true,
    port: parseInt(port, 10) || 38791,
    bind: bind || "127.0.0.1",
    token: token || defaultToken,
    mappings: [],
  };
}
