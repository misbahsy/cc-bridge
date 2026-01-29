/**
 * Control command handlers (/stop, /abort)
 */

import type { CommandDefinition, CommandContext } from "../parser.js";
import type { SessionManager } from "../../core/session-manager.js";

export function createControlCommands(sessionManager: SessionManager): CommandDefinition[] {
  return [
    {
      name: "stop",
      description: "Stop current response (not yet implemented)",
      async handler(ctx: CommandContext) {
        // TODO: Implement response cancellation via SDK
        await ctx.reply("Response stopping is not yet implemented in the SDK.");
      },
    },

    {
      name: "abort",
      description: "Abort and reset current session",
      async handler(ctx: CommandContext) {
        const activeSessionName = sessionManager.getActiveSessionName(ctx.message.chatKey);
        sessionManager.deleteSession(ctx.message.chatKey, activeSessionName);
        await ctx.reply(`✓ Aborted and reset session "${activeSessionName}".`);
      },
    },

    {
      name: "clear",
      description: "Clear all sessions and start fresh",
      async handler(ctx: CommandContext) {
        sessionManager.resetChat(ctx.message.chatKey);
        await ctx.reply("✓ Cleared all sessions. Starting fresh.");
      },
    },
  ];
}
