/**
 * Status command - shows bridge status
 */

import chalk from "chalk";
import { configExists, loadConfigSafe, getConfigPath } from "../../config/loader.js";
import { getDatabase, closeDatabase } from "../../db/sqlite.js";

export async function runStatus(): Promise<void> {
  console.log(chalk.cyan("\n📊 ccb Status\n"));

  // Check config
  console.log(chalk.bold("Configuration:"));
  if (!configExists()) {
    console.log(chalk.red("  ✗ No config found"));
    console.log(chalk.gray(`    Expected at: ${getConfigPath()}`));
    console.log(chalk.gray("    Run: ccb setup"));
    return;
  }

  const configResult = loadConfigSafe();
  if (!configResult.success) {
    console.log(chalk.red("  ✗ Config error:"), configResult.error);
    return;
  }

  console.log(chalk.green(`  ✓ Config loaded from ${getConfigPath()}`));

  const config = configResult.config;

  // Show agents
  console.log(chalk.bold("\nAgents:"));
  for (const agent of config.agents.list) {
    console.log(`  • ${agent.id}: ${agent.name}`);
    console.log(chalk.gray(`    Workspace: ${agent.workspace}`));
    if (agent.model) console.log(chalk.gray(`    Model: ${agent.model}`));
  }

  // Show channels
  console.log(chalk.bold("\nChannels:"));
  if (config.channels.telegram?.enabled) {
    console.log(`  • Telegram: ${chalk.green("enabled")}`);
    console.log(chalk.gray(`    Policy: ${config.channels.telegram.dmPolicy}`));
  } else {
    console.log(`  • Telegram: ${chalk.gray("disabled")}`);
  }

  if (config.channels.discord?.enabled) {
    console.log(`  • Discord: ${chalk.green("enabled")}`);
    console.log(chalk.gray(`    Policy: ${config.channels.discord.dmPolicy}`));
  } else {
    console.log(`  • Discord: ${chalk.gray("disabled")}`);
  }

  // Show webhooks
  console.log(chalk.bold("\nWebhooks:"));
  if (config.hooks?.enabled) {
    console.log(`  • Server: ${chalk.green("enabled")}`);
    console.log(chalk.gray(`    Bind: ${config.hooks.bind}:${config.hooks.port}`));
    console.log(chalk.gray(`    Mappings: ${config.hooks.mappings.length}`));
  } else {
    console.log(`  • Server: ${chalk.gray("disabled")}`);
  }

  // Show database stats
  console.log(chalk.bold("\nDatabase:"));
  try {
    const db = getDatabase();

    const sessions = db.listAllSessions();
    console.log(`  • Sessions: ${sessions.length}`);

    const allowlist = db.listAllowlist();
    console.log(`  • Allowlisted: ${allowlist.length}`);

    const pending = db.listPendingPairingRequests();
    console.log(`  • Pending pairings: ${pending.length}`);

    closeDatabase();
  } catch (error) {
    console.log(chalk.yellow(`  • Database not accessible`));
  }

  console.log();
}
