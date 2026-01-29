/**
 * Session management command handlers
 */

import type { CommandDefinition, CommandContext } from "../parser.js";
import type { SessionManager } from "../../core/session-manager.js";

export function createSessionCommands(sessionManager: SessionManager): CommandDefinition[] {
  return [
    {
      name: "new",
      aliases: ["reset"],
      description: "Start a fresh session",
      async handler(ctx: CommandContext) {
        sessionManager.resetChat(ctx.message.chatKey);
        await ctx.reply("✓ Started a fresh session. Previous context cleared.");
      },
    },

    {
      name: "sessions",
      description: "List your active sessions",
      async handler(ctx: CommandContext) {
        const sessions = sessionManager.listSessions(ctx.message.chatKey);
        const activeSessionName = sessionManager.getActiveSessionName(ctx.message.chatKey);

        if (sessions.length === 0) {
          await ctx.reply("No sessions found. Start chatting to create one.");
          return;
        }

        const lines = ["Your sessions:"];
        for (const session of sessions) {
          const isActive = session.sessionName === activeSessionName;
          const marker = isActive ? " ← active" : "";
          const age = formatAge(session.lastActive);
          lines.push(`• ${session.sessionName}${marker} (last active: ${age})`);
        }

        await ctx.reply(lines.join("\n"));
      },
    },

    {
      name: "session",
      description: "Switch to or create a named session",
      usage: "[name] or new [name]",
      async handler(ctx: CommandContext, args: string[]) {
        if (args.length === 0) {
          // Show current session
          const current = sessionManager.getActiveSessionName(ctx.message.chatKey);
          await ctx.reply(`Current session: ${current}`);
          return;
        }

        if (args[0] === "new") {
          // Create new named session
          const name = args[1] || `session-${Date.now()}`;
          await sessionManager.createNamedSession(ctx.message.chatKey, name);
          await ctx.reply(`✓ Created and switched to session "${name}"`);
          return;
        }

        // Switch to existing session
        const name = args[0];
        const success = sessionManager.switchSession(ctx.message.chatKey, name);

        if (success) {
          await ctx.reply(`✓ Switched to session "${name}"`);
        } else {
          await ctx.reply(`Session "${name}" not found. Use /session new ${name} to create it.`);
        }
      },
    },

    {
      name: "delete",
      description: "Delete a session",
      usage: "[name]",
      async handler(ctx: CommandContext, args: string[]) {
        const name = args[0] || "main";
        const activeSession = sessionManager.getActiveSessionName(ctx.message.chatKey);

        if (name === activeSession) {
          await ctx.reply("Cannot delete the active session. Switch to another session first.");
          return;
        }

        sessionManager.deleteSession(ctx.message.chatKey, name);
        await ctx.reply(`✓ Deleted session "${name}"`);
      },
    },

    {
      name: "compact",
      description: "Summarize context to save tokens (not yet implemented)",
      async handler(ctx: CommandContext) {
        // TODO: Implement context compaction via SDK
        await ctx.reply("Context compaction is not yet implemented.");
      },
    },
  ];
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
