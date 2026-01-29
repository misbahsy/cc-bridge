/**
 * Channel management commands
 */

import chalk from "chalk";
import { loadConfigSafe, configExists } from "../../config/loader.js";

export async function testChannels(): Promise<void> {
  if (!configExists()) {
    console.log(chalk.red("No config found. Run: ccb setup"));
    return;
  }

  const configResult = loadConfigSafe();
  if (!configResult.success) {
    console.log(chalk.red("Config error:"), configResult.error);
    return;
  }

  const config = configResult.config;

  console.log(chalk.bold("\nTesting Channel Connections:\n"));

  // Test Telegram - handle both single and multi-bot modes
  if (config.channels.telegram?.enabled) {
    if (config.channels.telegram.bots && config.channels.telegram.bots.length > 0) {
      // Multi-bot mode
      for (const bot of config.channels.telegram.bots) {
        console.log(chalk.cyan(`Testing Telegram (${bot.id})...`));
        try {
          const response = await fetch(
            `https://api.telegram.org/bot${bot.botToken}/getMe`
          );
          const data = await response.json() as { ok: boolean; result?: { username: string } };

          if (data.ok && data.result) {
            console.log(chalk.green(`  ✓ Telegram [${bot.id}]: @${data.result.username}`));
          } else {
            console.log(chalk.red(`  ✗ Telegram [${bot.id}]: Invalid token`));
          }
        } catch (error) {
          console.log(chalk.red(`  ✗ Telegram [${bot.id}]: ${error instanceof Error ? error.message : String(error)}`));
        }
      }
    } else if (config.channels.telegram.botToken) {
      // Single-bot mode
      console.log(chalk.cyan("Testing Telegram..."));
      try {
        const response = await fetch(
          `https://api.telegram.org/bot${config.channels.telegram.botToken}/getMe`
        );
        const data = await response.json() as { ok: boolean; result?: { username: string } };

        if (data.ok && data.result) {
          console.log(chalk.green(`  ✓ Telegram: @${data.result.username}`));
        } else {
          console.log(chalk.red(`  ✗ Telegram: Invalid token`));
        }
      } catch (error) {
        console.log(chalk.red(`  ✗ Telegram: ${error instanceof Error ? error.message : String(error)}`));
      }
    }
  } else {
    console.log(chalk.gray("  • Telegram: disabled"));
  }

  // Test Discord - handle both single and multi-bot modes
  if (config.channels.discord?.enabled) {
    if (config.channels.discord.bots && config.channels.discord.bots.length > 0) {
      // Multi-bot mode
      for (const bot of config.channels.discord.bots) {
        console.log(chalk.cyan(`Testing Discord (${bot.id})...`));
        try {
          const response = await fetch("https://discord.com/api/v10/users/@me", {
            headers: {
              Authorization: `Bot ${bot.token}`,
            },
          });

          if (response.ok) {
            const data = await response.json() as { username: string; discriminator: string };
            const tag = data.discriminator !== "0" ? `${data.username}#${data.discriminator}` : data.username;
            console.log(chalk.green(`  ✓ Discord [${bot.id}]: ${tag}`));
          } else {
            console.log(chalk.red(`  ✗ Discord [${bot.id}]: Invalid token (${response.status})`));
          }
        } catch (error) {
          console.log(chalk.red(`  ✗ Discord [${bot.id}]: ${error instanceof Error ? error.message : String(error)}`));
        }
      }
    } else if (config.channels.discord.token) {
      // Single-bot mode
      console.log(chalk.cyan("Testing Discord..."));
      try {
        const response = await fetch("https://discord.com/api/v10/users/@me", {
          headers: {
            Authorization: `Bot ${config.channels.discord.token}`,
          },
        });

        if (response.ok) {
          const data = await response.json() as { username: string; discriminator: string };
          const tag = data.discriminator !== "0" ? `${data.username}#${data.discriminator}` : data.username;
          console.log(chalk.green(`  ✓ Discord: ${tag}`));
        } else {
          console.log(chalk.red(`  ✗ Discord: Invalid token (${response.status})`));
        }
      } catch (error) {
        console.log(chalk.red(`  ✗ Discord: ${error instanceof Error ? error.message : String(error)}`));
      }
    }
  } else {
    console.log(chalk.gray("  • Discord: disabled"));
  }

  // Test webhook server
  if (config.hooks?.enabled) {
    console.log(chalk.cyan("Testing Webhook Server..."));
    const host = config.hooks.bind === "0.0.0.0" ? "localhost" : config.hooks.bind;
    const url = `http://${host}:${config.hooks.port}/health`;

    try {
      const response = await fetch(url);
      if (response.ok) {
        console.log(chalk.green(`  ✓ Webhooks: ${host}:${config.hooks.port}`));
      } else {
        console.log(chalk.yellow(`  • Webhooks: Not running (start bridge first)`));
      }
    } catch {
      console.log(chalk.yellow(`  • Webhooks: Not running (start bridge first)`));
    }
  } else {
    console.log(chalk.gray("  • Webhooks: disabled"));
  }

  console.log();
}

/**
 * Interactive setup guide for Discord
 */
export async function setupDiscord(): Promise<void> {
  console.log(chalk.bold.cyan("\n Discord Setup Guide\n"));
  console.log(chalk.white("Follow these steps to set up your Discord bot:\n"));

  console.log(chalk.bold("Step 1: Create a Discord Application"));
  console.log(chalk.gray("  1. Go to: ") + chalk.underline.blue("https://discord.com/developers/applications"));
  console.log(chalk.gray("  2. Click 'New Application' and give it a name"));
  console.log(chalk.gray("  3. Click 'Bot' in the left sidebar"));
  console.log(chalk.gray("  4. Click 'Add Bot' if no bot exists"));
  console.log();

  console.log(chalk.bold("Step 2: Get Your Bot Token"));
  console.log(chalk.gray("  1. In the Bot section, click 'Reset Token'"));
  console.log(chalk.gray("  2. Copy the token (keep it secret!)"));
  console.log();

  console.log(chalk.bold("Step 3: Enable Required Intents"));
  console.log(chalk.yellow("  IMPORTANT: These must be enabled or the bot won't work!"));
  console.log(chalk.gray("  1. Scroll down to 'Privileged Gateway Intents'"));
  console.log(chalk.gray("  2. Enable 'MESSAGE CONTENT INTENT'"));
  console.log(chalk.gray("  3. Enable 'SERVER MEMBERS INTENT' (optional, for richer user info)"));
  console.log();

  console.log(chalk.bold("Step 4: Create Your Private Server (for DMs)"));
  console.log(chalk.yellow("  Discord bots can only DM users who share a server with them."));
  console.log(chalk.gray("  1. In Discord, click the '+' to create a new server"));
  console.log(chalk.gray("  2. Choose 'Create My Own' > 'For me and my friends'"));
  console.log(chalk.gray("  3. Name it anything (e.g., 'Claude Bot Server')"));
  console.log(chalk.gray("  4. This server is just for the initial connection - you can DM the bot directly after"));
  console.log();

  console.log(chalk.bold("Step 5: Invite the Bot to Your Server"));
  console.log(chalk.gray("  1. Go back to Discord Developer Portal"));
  console.log(chalk.gray("  2. Click 'OAuth2' > 'URL Generator'"));
  console.log(chalk.gray("  3. Under 'Scopes', check 'bot'"));
  console.log(chalk.gray("  4. Under 'Bot Permissions', check:"));
  console.log(chalk.gray("     - Send Messages"));
  console.log(chalk.gray("     - Read Message History"));
  console.log(chalk.gray("     - View Channels"));
  console.log(chalk.gray("  5. Copy the generated URL and open it in your browser"));
  console.log(chalk.gray("  6. Select your private server and authorize"));
  console.log();

  console.log(chalk.bold("Step 6: Add Bot to Config"));
  console.log(chalk.gray("  Run the following command to add your bot:"));
  console.log();
  console.log(chalk.cyan("  ccb bot add discord <bot-id> -t <your-token> -a <agent-id>"));
  console.log();
  console.log(chalk.gray("  Example:"));
  console.log(chalk.cyan("  ccb bot add discord coder -t MTIzNDU2Nzg5... -a coder"));
  console.log();

  console.log(chalk.bold("Step 7: Test the Connection"));
  console.log(chalk.gray("  1. Start the bridge: ") + chalk.cyan("ccb start"));
  console.log(chalk.gray("  2. In Discord, right-click your bot > 'Message'"));
  console.log(chalk.gray("  3. Send a message - you should get a response from Claude!"));
  console.log();

  console.log(chalk.green("Tip: After the initial setup, you can DM the bot directly without using the server."));
  console.log();
}

/**
 * Test Discord connection with a specific token
 */
export async function testDiscord(token?: string): Promise<void> {
  // If no token provided, try to get from config
  if (!token) {
    if (!configExists()) {
      console.log(chalk.red("No config found. Provide a token or run: ccb setup"));
      return;
    }

    const configResult = loadConfigSafe();
    if (!configResult.success) {
      console.log(chalk.red("Config error:"), configResult.error);
      return;
    }

    const config = configResult.config;
    if (!config.channels.discord?.enabled) {
      console.log(chalk.yellow("Discord is not enabled in config."));
      console.log(chalk.gray("Run: ccb channels setup discord"));
      return;
    }

    // Get first available token
    if (config.channels.discord.bots && config.channels.discord.bots.length > 0) {
      token = config.channels.discord.bots[0].token;
    } else if (config.channels.discord.token) {
      token = config.channels.discord.token;
    } else {
      console.log(chalk.red("No Discord token found in config."));
      return;
    }
  }

  console.log(chalk.cyan("\nTesting Discord connection...\n"));

  try {
    // Test 1: Verify token
    console.log(chalk.gray("1. Verifying bot token..."));
    const meResponse = await fetch("https://discord.com/api/v10/users/@me", {
      headers: { Authorization: `Bot ${token}` },
    });

    if (!meResponse.ok) {
      console.log(chalk.red(`   ✗ Invalid token (HTTP ${meResponse.status})`));
      return;
    }

    const me = await meResponse.json() as { id: string; username: string; discriminator: string };
    const tag = me.discriminator !== "0" ? `${me.username}#${me.discriminator}` : me.username;
    console.log(chalk.green(`   ✓ Bot: ${tag} (ID: ${me.id})`));

    // Test 2: Check guilds
    console.log(chalk.gray("2. Checking server memberships..."));
    const guildsResponse = await fetch("https://discord.com/api/v10/users/@me/guilds", {
      headers: { Authorization: `Bot ${token}` },
    });

    if (!guildsResponse.ok) {
      console.log(chalk.yellow(`   ! Could not fetch servers (HTTP ${guildsResponse.status})`));
    } else {
      const guilds = await guildsResponse.json() as Array<{ id: string; name: string }>;
      if (guilds.length === 0) {
        console.log(chalk.yellow("   ! Bot is not in any servers"));
        console.log(chalk.gray("     Add the bot to a server to enable DMs"));
      } else {
        console.log(chalk.green(`   ✓ Bot is in ${guilds.length} server(s):`));
        for (const guild of guilds.slice(0, 5)) {
          console.log(chalk.gray(`     - ${guild.name}`));
        }
        if (guilds.length > 5) {
          console.log(chalk.gray(`     ... and ${guilds.length - 5} more`));
        }
      }
    }

    // Test 3: Check gateway
    console.log(chalk.gray("3. Checking gateway access..."));
    const gatewayResponse = await fetch("https://discord.com/api/v10/gateway/bot", {
      headers: { Authorization: `Bot ${token}` },
    });

    if (!gatewayResponse.ok) {
      console.log(chalk.yellow(`   ! Could not access gateway (HTTP ${gatewayResponse.status})`));
    } else {
      const gateway = await gatewayResponse.json() as { shards: number; session_start_limit: { remaining: number; total: number } };
      console.log(chalk.green(`   ✓ Gateway accessible`));
      console.log(chalk.gray(`     Shards: ${gateway.shards}, Sessions: ${gateway.session_start_limit.remaining}/${gateway.session_start_limit.total}`));
    }

    console.log(chalk.green("\n✓ Discord connection test passed!\n"));
    console.log(chalk.gray("Start the bridge with: ccb start"));
  } catch (error) {
    console.log(chalk.red(`\n✗ Connection test failed: ${error instanceof Error ? error.message : String(error)}`));
  }
}

/**
 * Interactive setup guide for Telegram
 */
export async function setupTelegram(): Promise<void> {
  console.log(chalk.bold.cyan("\n Telegram Setup Guide\n"));
  console.log(chalk.white("Follow these steps to set up your Telegram bot:\n"));

  console.log(chalk.bold("Step 1: Create a Bot"));
  console.log(chalk.gray("  1. Open Telegram and search for @BotFather"));
  console.log(chalk.gray("  2. Send /newbot"));
  console.log(chalk.gray("  3. Choose a name (e.g., 'Claude Code')"));
  console.log(chalk.gray("  4. Choose a username (e.g., 'MyClaudeBot')"));
  console.log(chalk.gray("  5. Copy the API token BotFather gives you"));
  console.log();

  console.log(chalk.bold("Step 2: Add Bot to Config"));
  console.log(chalk.gray("  Run the following command:"));
  console.log();
  console.log(chalk.cyan("  ccb bot add telegram <bot-id> -t <your-token> -a <agent-id>"));
  console.log();
  console.log(chalk.gray("  Example:"));
  console.log(chalk.cyan("  ccb bot add telegram coder -t 123456:ABC-xyz... -a coder"));
  console.log();

  console.log(chalk.bold("Step 3: Test the Connection"));
  console.log(chalk.gray("  1. Start the bridge: ") + chalk.cyan("ccb start"));
  console.log(chalk.gray("  2. Search for your bot in Telegram"));
  console.log(chalk.gray("  3. Send a message - you should get a response!"));
  console.log();

  console.log(chalk.green("Tip: Create multiple bots via BotFather for different agents!"));
  console.log();
}

/**
 * General setup command dispatcher
 */
export async function setupChannel(channel: string): Promise<void> {
  switch (channel.toLowerCase()) {
    case "discord":
      await setupDiscord();
      break;
    case "telegram":
      await setupTelegram();
      break;
    default:
      console.log(chalk.red(`Unknown channel: ${channel}`));
      console.log(chalk.gray("Available channels: telegram, discord"));
  }
}

/**
 * Test a specific channel
 */
export async function testChannel(channel: string, token?: string): Promise<void> {
  switch (channel.toLowerCase()) {
    case "discord":
      await testDiscord(token);
      break;
    case "telegram":
      // For Telegram, just run the general test
      console.log(chalk.gray("Running general channel test for Telegram..."));
      await testChannels();
      break;
    default:
      console.log(chalk.red(`Unknown channel: ${channel}`));
      console.log(chalk.gray("Available channels: telegram, discord"));
  }
}
