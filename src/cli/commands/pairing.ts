/**
 * Pairing management commands
 */

import chalk from "chalk";
import { getDatabase, closeDatabase } from "../../db/sqlite.js";
import { PairingManager } from "../../security/pairing.js";
import { AllowlistManager } from "../../security/allowlist.js";

export async function listPairing(): Promise<void> {
  const db = getDatabase();
  const pairingManager = new PairingManager(db);

  const pending = pairingManager.listPending();

  if (pending.length === 0) {
    console.log(chalk.gray("No pending pairing requests."));
    closeDatabase();
    return;
  }

  console.log(chalk.bold("\nPending Pairing Requests:\n"));

  for (const request of pending) {
    const timeLeft = Math.round((request.expiresAt.getTime() - Date.now()) / 60000);
    console.log(chalk.bold(`  Code: ${request.code}`));
    console.log(chalk.gray(`    Chat: ${request.chatKey}`));
    console.log(chalk.gray(`    User: ${request.userInfo.displayName || request.userInfo.username || request.userInfo.id}`));
    console.log(chalk.gray(`    Channel: ${request.userInfo.channel}`));
    console.log(chalk.gray(`    Expires in: ${timeLeft} minutes`));
    console.log();
  }

  console.log(chalk.cyan(`To approve: ccb pairing approve <code>`));
  console.log(chalk.cyan(`To reject:  ccb pairing reject <code>`));

  closeDatabase();
}

export async function approvePairing(code: string): Promise<void> {
  const db = getDatabase();
  const pairingManager = new PairingManager(db);

  const result = pairingManager.approve(code.toUpperCase());

  if (result.success) {
    console.log(chalk.green(`✓ Approved ${result.chatKey}`));
    console.log(chalk.gray(`  User: ${result.userInfo.displayName || result.userInfo.username || result.userInfo.id}`));
    console.log(chalk.gray(`  Channel: ${result.userInfo.channel}`));
  } else {
    console.log(chalk.red(`✗ ${result.reason}`));
  }

  closeDatabase();
}

export async function rejectPairing(code: string): Promise<void> {
  const db = getDatabase();
  const pairingManager = new PairingManager(db);

  const success = pairingManager.reject(code.toUpperCase());

  if (success) {
    console.log(chalk.green(`✓ Rejected pairing code ${code}`));
  } else {
    console.log(chalk.red(`✗ Pairing code not found: ${code}`));
  }

  closeDatabase();
}

export async function revokePairing(chatKey: string): Promise<void> {
  const db = getDatabase();
  const allowlistManager = new AllowlistManager(db);

  // Check if in allowlist
  if (!allowlistManager.check(chatKey)) {
    console.log(chalk.yellow(`Chat not in allowlist: ${chatKey}`));
    closeDatabase();
    return;
  }

  allowlistManager.remove(chatKey);
  console.log(chalk.green(`✓ Revoked access for ${chatKey}`));

  // Also delete sessions
  db.deleteAllSessions(chatKey);
  console.log(chalk.gray(`  Sessions also deleted`));

  closeDatabase();
}
