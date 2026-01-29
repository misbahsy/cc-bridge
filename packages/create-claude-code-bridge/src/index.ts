#!/usr/bin/env node

/**
 * npx create-ccb
 *
 * Quick installer for ccb
 */

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import chalk from "chalk";
import ora from "ora";

const CONFIG_DIR = join(homedir(), ".ccb");
const CONFIG_FILE = join(CONFIG_DIR, "config.json");

async function main(): Promise<void> {
  console.log(chalk.bold.cyan("\n🚀 create-ccb\n"));

  // Check Node.js version
  const nodeVersion = process.versions.node;
  const majorVersion = parseInt(nodeVersion.split(".")[0], 10);

  if (majorVersion < 20) {
    console.log(chalk.red(`✗ Node.js 20+ required. You have ${nodeVersion}`));
    console.log(chalk.gray("  Install Node.js 20+: https://nodejs.org/"));
    process.exit(1);
  }
  console.log(chalk.green(`✓ Node.js ${nodeVersion}`));

  // Check if Claude Code is installed
  const claudeInstalled = await checkCommand("claude", ["--version"]);
  if (claudeInstalled) {
    console.log(chalk.green("✓ Claude Code installed"));
  } else {
    console.log(chalk.yellow("⚠ Claude Code not found"));
    console.log(chalk.gray("  Install: npm install -g @anthropic-ai/claude-code"));
  }

  // Check if already configured
  if (existsSync(CONFIG_FILE)) {
    console.log(chalk.yellow(`\n⚠ Config already exists at ${CONFIG_FILE}`));
    console.log(chalk.gray("  Run: ccb setup to reconfigure"));
    console.log(chalk.gray("  Run: ccb start to start the bridge"));
    return;
  }

  // Install ccb globally
  console.log(chalk.cyan("\nInstalling ccb...\n"));

  const spinner = ora("Installing...").start();

  try {
    await runCommand("npm", ["install", "-g", "ccb"]);
    spinner.succeed("ccb installed");
  } catch (error) {
    spinner.fail("Installation failed");
    console.log(chalk.red(`Error: ${error instanceof Error ? error.message : String(error)}`));
    console.log(chalk.gray("\nTry installing manually:"));
    console.log(chalk.bold("  npm install -g ccb"));
    process.exit(1);
  }

  // Run setup wizard
  console.log(chalk.cyan("\nStarting setup wizard...\n"));

  try {
    await runCommandInteractive("ccb", ["setup"]);
  } catch (error) {
    console.log(chalk.yellow("\nSetup was not completed."));
    console.log(chalk.gray("Run: ccb setup to continue configuration"));
  }

  console.log(chalk.green("\n✓ Done!\n"));
  console.log(chalk.cyan("Quick start:"));
  console.log(chalk.bold("  ccb start    - Start the bridge"));
  console.log(chalk.bold("  ccb status   - Check status"));
  console.log(chalk.bold("  ccb --help   - Show all commands"));
  console.log();
}

async function checkCommand(cmd: string, args: string[]): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, {
      stdio: "ignore",
      shell: true,
    });

    child.on("close", (code) => {
      resolve(code === 0);
    });

    child.on("error", () => {
      resolve(false);
    });
  });
}

async function runCommand(cmd: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      stdio: "inherit",
      shell: true,
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Command failed with code ${code}`));
      }
    });

    child.on("error", (error) => {
      reject(error);
    });
  });
}

async function runCommandInteractive(cmd: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      stdio: "inherit",
      shell: true,
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Command exited with code ${code}`));
      }
    });

    child.on("error", (error) => {
      reject(error);
    });
  });
}

main().catch((error) => {
  console.error(chalk.red("Error:"), error instanceof Error ? error.message : String(error));
  process.exit(1);
});
