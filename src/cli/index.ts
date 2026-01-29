#!/usr/bin/env node

/**
 * CLI entry point for ccb
 */

import { Command } from "commander";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Read package.json for version
const packageJsonPath = join(__dirname, "..", "..", "package.json");
const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8"));

const program = new Command();

program
  .name("ccb")
  .description("Bridge messaging platforms to Claude Code sessions")
  .version(packageJson.version);

// Import commands dynamically to avoid loading all deps upfront
program
  .command("setup")
  .description("Interactive setup wizard")
  .action(async () => {
    const { runSetup } = await import("./commands/setup.js");
    await runSetup();
  });

program
  .command("start")
  .description("Start the bridge")
  .option("-d, --daemon", "Run in background (using PM2)")
  .option("-c, --config <path>", "Path to config file")
  .action(async (options) => {
    const { runStart } = await import("./commands/start.js");
    await runStart(options);
  });

program
  .command("status")
  .description("Show bridge status")
  .action(async () => {
    const { runStatus } = await import("./commands/status.js");
    await runStatus();
  });

// Pairing commands
const pairing = program.command("pairing").description("Manage pairing codes");

pairing
  .command("list")
  .description("List pending pairing requests")
  .action(async () => {
    const { listPairing } = await import("./commands/pairing.js");
    await listPairing();
  });

pairing
  .command("approve <code>")
  .description("Approve a pairing code")
  .action(async (code) => {
    const { approvePairing } = await import("./commands/pairing.js");
    await approvePairing(code);
  });

pairing
  .command("reject <code>")
  .description("Reject a pairing code")
  .action(async (code) => {
    const { rejectPairing } = await import("./commands/pairing.js");
    await rejectPairing(code);
  });

pairing
  .command("revoke <chatKey>")
  .description("Revoke access for a chat")
  .action(async (chatKey) => {
    const { revokePairing } = await import("./commands/pairing.js");
    await revokePairing(chatKey);
  });

// Session commands
const sessions = program.command("sessions").description("Manage sessions");

sessions
  .command("list")
  .description("List all sessions")
  .action(async () => {
    const { listSessions } = await import("./commands/sessions.js");
    await listSessions();
  });

sessions
  .command("delete <sessionId>")
  .description("Delete a session")
  .action(async (sessionId) => {
    const { deleteSession } = await import("./commands/sessions.js");
    await deleteSession(sessionId);
  });

// Hook commands
const hooks = program.command("hooks").description("Manage webhooks");

hooks
  .command("list")
  .description("List configured webhooks")
  .action(async () => {
    const { listHooks } = await import("./commands/hooks.js");
    await listHooks();
  });

hooks
  .command("url <name>")
  .description("Show URL for a webhook")
  .action(async (name) => {
    const { showHookUrl } = await import("./commands/hooks.js");
    await showHookUrl(name);
  });

hooks
  .command("test <name>")
  .description("Test a webhook")
  .option("-p, --payload <json>", "JSON payload to send")
  .action(async (name, options) => {
    const { testHook } = await import("./commands/hooks.js");
    await testHook(name, options.payload);
  });

// Channel commands
const channels = program.command("channels").description("Manage channels");

channels
  .command("test [channel]")
  .description("Test channel connections (optionally specify: telegram, discord)")
  .option("-t, --token <token>", "Bot token to test with")
  .action(async (channel, options) => {
    if (channel) {
      const { testChannel } = await import("./commands/channels.js");
      await testChannel(channel, options.token);
    } else {
      const { testChannels } = await import("./commands/channels.js");
      await testChannels();
    }
  });

channels
  .command("setup <channel>")
  .description("Interactive setup guide (telegram, discord)")
  .action(async (channel) => {
    const { setupChannel } = await import("./commands/channels.js");
    await setupChannel(channel);
  });

// Allowlist commands
const allowlist = program.command("allowlist").description("Manage allowlist");

allowlist
  .command("list")
  .description("List allowed chats")
  .action(async () => {
    const { listAllowlist } = await import("./commands/allowlist.js");
    await listAllowlist();
  });

allowlist
  .command("add <chatKey>")
  .description("Add a chat to allowlist")
  .action(async (chatKey) => {
    const { addToAllowlist } = await import("./commands/allowlist.js");
    await addToAllowlist(chatKey);
  });

allowlist
  .command("remove <chatKey>")
  .description("Remove a chat from allowlist")
  .action(async (chatKey) => {
    const { removeFromAllowlist } = await import("./commands/allowlist.js");
    await removeFromAllowlist(chatKey);
  });

// Logs command
program
  .command("logs")
  .description("View and tail message logs")
  .option("-c, --chat-key <key>", "Filter by chat key")
  .option("-n, --limit <number>", "Number of entries to show", "20")
  .option("-t, --tail", "Follow new log entries")
  .option("-f, --files", "List log files")
  .action(async (options) => {
    const { runLogs } = await import("./commands/logs.js");
    await runLogs({
      chatKey: options.chatKey,
      limit: parseInt(options.limit, 10),
      tail: options.tail,
      files: options.files,
    });
  });

// Agent management commands
const agent = program.command("agent").description("Manage agents");

agent
  .command("add <id>")
  .description("Add a new agent")
  .requiredOption("-w, --workspace <path>", "Working directory for the agent")
  .option("-n, --name <name>", "Display name")
  .option("-m, --model <model>", "Claude model (e.g., claude-sonnet-4-5)")
  .option("-p, --system-prompt <prompt>", "System prompt")
  .option("-t, --tools <tools>", "Comma-separated list of allowed tools")
  .option("-d, --disallowed-tools <tools>", "Comma-separated list of blocked tools")
  .action(async (id, options) => {
    const { addAgent } = await import("./commands/agent.js");
    await addAgent(id, options);
  });

agent
  .command("list")
  .description("List all agents")
  .action(async () => {
    const { listAgents } = await import("./commands/agent.js");
    await listAgents();
  });

agent
  .command("remove <id>")
  .description("Remove an agent")
  .action(async (id) => {
    const { removeAgent } = await import("./commands/agent.js");
    await removeAgent(id);
  });

// Bot management commands
const bot = program.command("bot").description("Manage bots");

bot
  .command("add <channel> <id>")
  .description("Add a new bot (channel: telegram or discord)")
  .requiredOption("-t, --token <token>", "Bot token")
  .option("-a, --agent <agentId>", "Bind to specific agent")
  .option("-p, --dm-policy <policy>", "DM policy: open, pairing, or allowlist")
  .action(async (channel, id, options) => {
    const { addBot } = await import("./commands/bot.js");
    await addBot(channel, id, options);
  });

bot
  .command("list")
  .description("List all bots")
  .action(async () => {
    const { listBots } = await import("./commands/bot.js");
    await listBots();
  });

bot
  .command("remove <channel> <id>")
  .description("Remove a bot")
  .action(async (channel, id) => {
    const { removeBot } = await import("./commands/bot.js");
    await removeBot(channel, id);
  });

program.parse();
