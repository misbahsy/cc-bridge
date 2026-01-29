/**
 * Session management commands
 */

import chalk from "chalk";
import { getDatabase, closeDatabase } from "../../db/sqlite.js";

export async function listSessions(): Promise<void> {
  const db = getDatabase();
  const sessions = db.listAllSessions();

  if (sessions.length === 0) {
    console.log(chalk.gray("No sessions found."));
    closeDatabase();
    return;
  }

  console.log(chalk.bold("\nAll Sessions:\n"));

  // Group by chat key
  const grouped = new Map<string, typeof sessions>();
  for (const session of sessions) {
    const existing = grouped.get(session.chatKey) || [];
    existing.push(session);
    grouped.set(session.chatKey, existing);
  }

  for (const [chatKey, chatSessions] of grouped) {
    console.log(chalk.bold(`  ${chatKey}`));

    for (const session of chatSessions) {
      const age = formatAge(session.lastActive);
      console.log(chalk.gray(`    • ${session.sessionName} (${age})`));
      console.log(chalk.gray(`      Agent: ${session.agentId}`));
      console.log(chalk.gray(`      SDK ID: ${session.sdkSessionId.slice(0, 20)}...`));
    }
    console.log();
  }

  console.log(chalk.gray(`Total: ${sessions.length} sessions across ${grouped.size} chats`));

  closeDatabase();
}

export async function deleteSession(identifier: string): Promise<void> {
  const db = getDatabase();

  // Try to find by SDK session ID
  const sessionBySdkId = db.getSessionBySdkId(identifier);
  if (sessionBySdkId) {
    db.deleteSession(sessionBySdkId.chatKey, sessionBySdkId.sessionName);
    console.log(chalk.green(`✓ Deleted session ${sessionBySdkId.sessionName} for ${sessionBySdkId.chatKey}`));
    closeDatabase();
    return;
  }

  // Try as chat key
  const sessions = db.listSessions(identifier);
  if (sessions.length > 0) {
    db.deleteAllSessions(identifier);
    console.log(chalk.green(`✓ Deleted ${sessions.length} sessions for ${identifier}`));
    closeDatabase();
    return;
  }

  console.log(chalk.red(`✗ No sessions found for: ${identifier}`));
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
