/**
 * Status and info command handlers
 */

import type { CommandDefinition, CommandContext } from "../parser.js";
import type { CommandParser } from "../parser.js";
import type { SessionManager } from "../../core/session-manager.js";

export function createStatusCommands(
  sessionManager: SessionManager,
  parser: CommandParser
): CommandDefinition[] {
  return [
    {
      name: "help",
      aliases: ["h", "?"],
      description: "Show available commands",
      async handler(ctx: CommandContext) {
        await ctx.reply(parser.generateHelp());
      },
    },

    {
      name: "status",
      description: "Show session status",
      async handler(ctx: CommandContext) {
        const sessions = sessionManager.listSessions(ctx.message.chatKey);
        const activeSessionName = sessionManager.getActiveSessionName(ctx.message.chatKey);
        const activeSession = sessions.find((s) => s.sessionName === activeSessionName);

        const lines = ["Session Status:"];
        lines.push(`• Active session: ${activeSessionName}`);
        lines.push(`• Total sessions: ${sessions.length}`);

        if (activeSession) {
          lines.push(`• Agent: ${activeSession.agentId}`);
          lines.push(`• Workspace: ${activeSession.workspace || "(default)"}`);
          lines.push(`• Created: ${formatDate(activeSession.createdAt)}`);
          lines.push(`• Last active: ${formatDate(activeSession.lastActive)}`);
        }

        await ctx.reply(lines.join("\n"));
      },
    },

    {
      name: "whoami",
      description: "Show your user info",
      async handler(ctx: CommandContext) {
        const { userInfo, chatKey, channel, isGroup, groupId } = ctx.message;

        const lines = ["Your Info:"];
        lines.push(`• User ID: ${userInfo.id}`);
        if (userInfo.username) lines.push(`• Username: ${userInfo.username}`);
        if (userInfo.displayName) lines.push(`• Display name: ${userInfo.displayName}`);
        lines.push(`• Channel: ${channel}`);
        lines.push(`• Chat key: ${chatKey}`);
        if (isGroup) lines.push(`• Group ID: ${groupId}`);

        await ctx.reply(lines.join("\n"));
      },
    },

    {
      name: "ping",
      description: "Check if the bot is responsive",
      async handler(ctx: CommandContext) {
        const start = Date.now();
        await ctx.reply(`Pong! (${Date.now() - start}ms)`);
      },
    },
  ];
}

function formatDate(date: Date): string {
  return date.toLocaleString();
}
