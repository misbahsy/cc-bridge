/**
 * Allowlist management commands
 */

import chalk from "chalk";
import { getDatabase, closeDatabase } from "../../db/sqlite.js";
import { AllowlistManager } from "../../security/allowlist.js";

export async function listAllowlist(): Promise<void> {
  const db = getDatabase();
  const allowlistManager = new AllowlistManager(db);

  const entries = allowlistManager.list();

  if (entries.length === 0) {
    console.log(chalk.gray("Allowlist is empty."));
    closeDatabase();
    return;
  }

  console.log(chalk.bold("\nAllowed Chats:\n"));

  for (const entry of entries) {
    const age = formatAge(entry.addedAt);
    console.log(chalk.bold(`  ${entry.chatKey}`));
    console.log(chalk.gray(`    Added: ${age}`));
    if (entry.addedBy) {
      console.log(chalk.gray(`    By: ${entry.addedBy}`));
    }
    console.log();
  }

  console.log(chalk.gray(`Total: ${entries.length} entries`));

  closeDatabase();
}

export async function addToAllowlist(chatKey: string): Promise<void> {
  const db = getDatabase();
  const allowlistManager = new AllowlistManager(db);

  // Check if already in allowlist
  if (allowlistManager.check(chatKey)) {
    console.log(chalk.yellow(`Already in allowlist: ${chatKey}`));
    closeDatabase();
    return;
  }

  allowlistManager.add(chatKey, "manual:cli");
  console.log(chalk.green(`✓ Added to allowlist: ${chatKey}`));

  closeDatabase();
}

export async function removeFromAllowlist(chatKey: string): Promise<void> {
  const db = getDatabase();
  const allowlistManager = new AllowlistManager(db);

  // Check if in allowlist
  if (!allowlistManager.check(chatKey)) {
    console.log(chalk.yellow(`Not in allowlist: ${chatKey}`));
    closeDatabase();
    return;
  }

  allowlistManager.remove(chatKey);
  console.log(chalk.green(`✓ Removed from allowlist: ${chatKey}`));

  // Optionally delete sessions too
  const sessions = db.listSessions(chatKey);
  if (sessions.length > 0) {
    console.log(chalk.gray(`  Note: ${sessions.length} sessions still exist. Use 'ccb sessions delete ${chatKey}' to remove them.`));
  }

  closeDatabase();
}

function formatAge(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${diffDays}d ago`;
}
