/**
 * Settings command handlers
 */

import type { CommandDefinition, CommandContext } from "../parser.js";
import type { SessionManager } from "../../core/session-manager.js";

export function createSettingsCommands(sessionManager: SessionManager): CommandDefinition[] {
  const router = sessionManager.getRouter();

  return [
    {
      name: "model",
      description: "Show or change the model (per-session)",
      usage: "[model-name]",
      async handler(ctx: CommandContext, args: string[]) {
        const sessions = sessionManager.listSessions(ctx.message.chatKey);
        const activeSessionName = sessionManager.getActiveSessionName(ctx.message.chatKey);
        const activeSession = sessions.find((s) => s.sessionName === activeSessionName);

        if (args.length === 0) {
          // Show current model
          if (activeSession) {
            const agent = router.getAgent(activeSession.agentId);
            const model = agent?.model || "default";
            await ctx.reply(`Current model: ${model}`);
          } else {
            await ctx.reply("No active session. Start chatting first.");
          }
          return;
        }

        // Changing model requires creating a new session
        await ctx.reply(
          "Model changes are not yet supported mid-session.\n" +
            "Use /new to start a fresh session with a different agent configuration."
        );
      },
    },

    {
      name: "workspace",
      description: "Show current workspace",
      async handler(ctx: CommandContext) {
        const sessions = sessionManager.listSessions(ctx.message.chatKey);
        const activeSessionName = sessionManager.getActiveSessionName(ctx.message.chatKey);
        const activeSession = sessions.find((s) => s.sessionName === activeSessionName);

        if (activeSession) {
          const workspace = activeSession.workspace || "(not set)";
          await ctx.reply(`Current workspace: ${workspace}`);
        } else {
          await ctx.reply("No active session. Start chatting first.");
        }
      },
    },

    {
      name: "agent",
      description: "Show or switch agent",
      usage: "[agent-id]",
      async handler(ctx: CommandContext, args: string[]) {
        const agents = router.getAllAgents();

        if (args.length === 0) {
          // List agents
          const sessions = sessionManager.listSessions(ctx.message.chatKey);
          const activeSessionName = sessionManager.getActiveSessionName(ctx.message.chatKey);
          const activeSession = sessions.find((s) => s.sessionName === activeSessionName);
          const currentAgentId = activeSession?.agentId;

          const lines = ["Available agents:"];
          for (const agent of agents) {
            const marker = agent.id === currentAgentId ? " ← current" : "";
            lines.push(`• ${agent.id}: ${agent.name}${marker}`);
            if (agent.workspace) {
              lines.push(`  Workspace: ${agent.workspace}`);
            }
          }

          await ctx.reply(lines.join("\n"));
          return;
        }

        // Switch agent
        const agentId = args[0];
        const agent = router.getAgent(agentId);

        if (!agent) {
          await ctx.reply(`Unknown agent: ${agentId}`);
          return;
        }

        // Create new session with different agent
        await sessionManager.createNamedSession(ctx.message.chatKey, "main", agentId);
        await ctx.reply(`✓ Switched to agent "${agent.name}" (${agent.id})\nThis starts a fresh session.`);
      },
    },

    {
      name: "agents",
      description: "List all available agents",
      async handler(ctx: CommandContext) {
        const agents = router.getAllAgents();

        const lines = ["Available agents:"];
        for (const agent of agents) {
          lines.push(`\n${agent.id}: ${agent.name}`);
          if (agent.workspace) lines.push(`  Workspace: ${agent.workspace}`);
          if (agent.model) lines.push(`  Model: ${agent.model}`);
        }

        await ctx.reply(lines.join("\n"));
      },
    },
  ];
}
