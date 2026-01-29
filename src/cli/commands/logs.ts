/**
 * Logs command - view and tail message logs
 */

import chalk from "chalk";
import * as fs from "fs";
import * as path from "path";
import { homedir } from "os";
import { configExists, loadConfigSafe } from "../../config/loader.js";
import { MessageLogger, type LogEntry } from "../../core/logger.js";

interface LogsOptions {
  chatKey?: string;
  limit?: number;
  tail?: boolean;
  files?: boolean;
}

/**
 * Expand ~ to home directory
 */
function expandPath(p: string): string {
  if (p.startsWith("~")) {
    return path.join(homedir(), p.slice(1));
  }
  return p;
}

/**
 * Format a log entry for display
 */
function formatEntry(entry: LogEntry): string {
  const time = new Date(entry.timestamp).toLocaleTimeString();

  // Clear distinction between user and agent
  const isUser = entry.direction === "incoming";
  const directionLabel = isUser
    ? chalk.blue.bold("USER →")
    : chalk.green.bold("AGENT ←");

  const chatKey = chalk.gray(entry.chatKey);
  const agentName = entry.agentId ? chalk.yellow(`[${entry.agentId}]`) : "";
  const type = entry.messageType !== "text" ? chalk.magenta(`(${entry.messageType})`) : "";

  let content = entry.content;
  if (content.length > 200) {
    content = content.slice(0, 200) + "...";
  }

  return `${chalk.gray(time)} ${directionLabel} ${chatKey} ${agentName} ${type}\n  ${content}`;
}

export async function runLogs(options: LogsOptions): Promise<void> {
  // Load config to get logging path
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

  if (!config.logging?.enabled) {
    console.log(chalk.yellow("Logging is not enabled in config."));
    console.log(chalk.gray("Add logging configuration to enable message logging:"));
    console.log(chalk.gray(`
  logging:
    enabled: true
    path: ~/.ccb/logs/
    format: jsonl
    retention: 7d
`));
    return;
  }

  const logPath = expandPath(config.logging.path);

  if (!fs.existsSync(logPath)) {
    console.log(chalk.yellow("No log directory found."));
    console.log(chalk.gray(`Expected at: ${logPath}`));
    return;
  }

  // List files mode
  if (options.files) {
    console.log(chalk.cyan("\n📋 Log Files\n"));
    const files = fs.readdirSync(logPath)
      .filter(f => f.startsWith("messages-"))
      .sort()
      .reverse();

    if (files.length === 0) {
      console.log(chalk.gray("No log files found."));
      return;
    }

    for (const file of files) {
      const filePath = path.join(logPath, file);
      const stats = fs.statSync(filePath);
      const size = (stats.size / 1024).toFixed(1);
      console.log(`  ${file} (${size} KB)`);
    }
    console.log();
    return;
  }

  // Tail mode
  if (options.tail) {
    console.log(chalk.cyan(`\n📝 Tailing logs${options.chatKey ? ` for ${options.chatKey}` : ""}...\n`));
    console.log(chalk.gray("Press Ctrl+C to stop.\n"));

    const logger = new MessageLogger(config.logging);
    let lastTimestamp = "";

    const pollLogs = () => {
      const entries = logger.readLogs(options.chatKey, 50);

      for (const entry of entries) {
        if (entry.timestamp > lastTimestamp) {
          console.log(formatEntry(entry));
          console.log();
          lastTimestamp = entry.timestamp;
        }
      }
    };

    // Initial poll
    pollLogs();

    // Poll every second
    const interval = setInterval(pollLogs, 1000);

    // Handle shutdown
    process.on("SIGINT", () => {
      clearInterval(interval);
      console.log(chalk.gray("\nStopped tailing."));
      process.exit(0);
    });

    // Keep process running
    await new Promise(() => {});
    return;
  }

  // Default: show recent logs
  console.log(chalk.cyan(`\n📝 Recent Logs${options.chatKey ? ` for ${options.chatKey}` : ""}\n`));

  const logger = new MessageLogger(config.logging);
  const limit = options.limit || 20;
  const entries = logger.readLogs(options.chatKey, limit);

  if (entries.length === 0) {
    console.log(chalk.gray("No log entries found."));
    return;
  }

  for (const entry of entries) {
    console.log(formatEntry(entry));
    console.log();
  }

  console.log(chalk.gray(`Showing ${entries.length} of last ${limit} entries.`));
  console.log(chalk.gray("Use --tail to follow new logs, or --limit N to see more.\n"));
}
