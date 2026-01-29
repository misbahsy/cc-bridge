/**
 * Agent management commands - add, list, remove agents without editing config
 */

import chalk from "chalk";
import { configExists, loadConfigSafe, saveConfig } from "../../config/loader.js";
import type { AgentConfig, BridgeConfig } from "../../core/types.js";

interface AddAgentOptions {
  name?: string;
  workspace: string;
  model?: string;
  systemPrompt?: string;
  tools?: string;
  disallowedTools?: string;
}

export async function addAgent(id: string, options: AddAgentOptions): Promise<void> {
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

  // Check if agent already exists
  const existing = config.agents.list.find(a => a.id === id);
  if (existing) {
    console.log(chalk.red(`Agent "${id}" already exists.`));
    console.log(chalk.gray("Use 'ccb agent remove' first, or choose a different ID."));
    return;
  }

  // Create new agent
  const newAgent: AgentConfig = {
    id,
    name: options.name || id,
    workspace: options.workspace,
  };

  if (options.model) newAgent.model = options.model;
  if (options.systemPrompt) newAgent.systemPrompt = options.systemPrompt;
  if (options.tools) newAgent.tools = options.tools.split(",").map(t => t.trim());
  if (options.disallowedTools) newAgent.disallowedTools = options.disallowedTools.split(",").map(t => t.trim());

  // Add to config
  config.agents.list.push(newAgent);

  // Save config
  saveConfig(config);

  console.log(chalk.green(`✓ Agent "${id}" added successfully!`));
  console.log();
  console.log(chalk.cyan("Agent details:"));
  console.log(`  ID: ${newAgent.id}`);
  console.log(`  Name: ${newAgent.name}`);
  console.log(`  Workspace: ${newAgent.workspace}`);
  if (newAgent.model) console.log(`  Model: ${newAgent.model}`);
  if (newAgent.tools) console.log(`  Tools: ${newAgent.tools.join(", ")}`);
  if (newAgent.disallowedTools) console.log(`  Blocked: ${newAgent.disallowedTools.join(", ")}`);
  console.log();
  console.log(chalk.yellow("Restart the bridge to use the new agent:"));
  console.log(chalk.bold("  ccb start"));
}

export async function listAgents(): Promise<void> {
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

  console.log(chalk.cyan("\n🤖 Configured Agents\n"));

  if (config.agents.list.length === 0) {
    console.log(chalk.gray("No agents configured."));
    console.log(chalk.gray("Add one with: ccb agent add <id> --workspace /path"));
    return;
  }

  for (const agent of config.agents.list) {
    console.log(chalk.bold(`• ${agent.id}`));
    console.log(`  Name: ${agent.name}`);
    console.log(`  Workspace: ${agent.workspace}`);
    if (agent.model) console.log(`  Model: ${agent.model}`);
    if (agent.systemPrompt) console.log(`  Prompt: ${agent.systemPrompt.slice(0, 50)}...`);
    if (agent.tools) console.log(`  Tools: ${agent.tools.join(", ")}`);
    if (agent.disallowedTools) console.log(`  Blocked: ${agent.disallowedTools.join(", ")}`);
    if (agent.mcpServers?.length) console.log(`  MCP Servers: ${agent.mcpServers.map(s => s.name).join(", ")}`);
    console.log();
  }
}

export async function removeAgent(id: string): Promise<void> {
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

  const index = config.agents.list.findIndex(a => a.id === id);
  if (index === -1) {
    console.log(chalk.red(`Agent "${id}" not found.`));
    console.log(chalk.gray("Use 'ccb agent list' to see available agents."));
    return;
  }

  // Check if this is the last agent
  if (config.agents.list.length === 1) {
    console.log(chalk.red("Cannot remove the last agent."));
    console.log(chalk.gray("At least one agent must be configured."));
    return;
  }

  // Check if any bots reference this agent
  const telegramBots = config.channels.telegram?.bots?.filter(b => b.agentId === id) || [];
  const discordBots = config.channels.discord?.bots?.filter(b => b.agentId === id) || [];

  if (telegramBots.length > 0 || discordBots.length > 0) {
    console.log(chalk.yellow(`Warning: The following bots reference agent "${id}":`));
    for (const bot of telegramBots) console.log(`  • Telegram: ${bot.id}`);
    for (const bot of discordBots) console.log(`  • Discord: ${bot.id}`);
    console.log(chalk.gray("These bots will fall back to the default agent."));
  }

  // Remove agent
  config.agents.list.splice(index, 1);
  saveConfig(config);

  console.log(chalk.green(`✓ Agent "${id}" removed.`));
  console.log(chalk.yellow("Restart the bridge for changes to take effect."));
}
