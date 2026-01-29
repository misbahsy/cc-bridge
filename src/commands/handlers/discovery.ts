/**
 * Discovery command handlers - /skills, /plugins, /mcp
 */

import * as fs from "fs";
import * as path from "path";
import { homedir } from "os";
import type { CommandDefinition, CommandContext } from "../parser.js";
import type { SessionManager } from "../../core/session-manager.js";

/**
 * Built-in skills that are always available in Claude Code
 */
const BUILTIN_SKILLS = [
  { name: "commit", description: "Create well-formatted git commits" },
  { name: "review", description: "Review code changes for bugs and best practices" },
  { name: "test", description: "Generate tests for code" },
  { name: "explain", description: "Explain how code works" },
  { name: "fix", description: "Fix bugs or issues in code" },
  { name: "research", description: "Deep research on a topic using web search" },
];

interface SkillInfo {
  name: string;
  description: string;
  source: "builtin" | "user" | "project";
}

/**
 * Scan a directory for SKILL.md files and extract skill info
 */
function scanSkillsDirectory(dir: string, source: "user" | "project"): SkillInfo[] {
  const skills: SkillInfo[] = [];

  if (!fs.existsSync(dir)) {
    return skills;
  }

  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const skillMdPath = path.join(dir, entry.name, "SKILL.md");
        if (fs.existsSync(skillMdPath)) {
          const content = fs.readFileSync(skillMdPath, "utf-8");
          const description = extractSkillDescription(content) || "No description";
          skills.push({
            name: entry.name,
            description,
            source,
          });
        }
      }
    }
  } catch {
    // Ignore read errors
  }

  return skills;
}

/**
 * Extract description from SKILL.md frontmatter or first paragraph
 */
function extractSkillDescription(content: string): string | null {
  // Try to extract from YAML frontmatter
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (frontmatterMatch) {
    const descMatch = frontmatterMatch[1].match(/description:\s*["']?([^"'\n]+)["']?/);
    if (descMatch) {
      return descMatch[1].trim();
    }
  }

  // Fall back to first non-empty line after any heading
  const lines = content.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("#") && !trimmed.startsWith("---")) {
      return trimmed.slice(0, 100);
    }
  }

  return null;
}

/**
 * Get all installed skills
 */
function getInstalledSkills(workspacePath?: string): SkillInfo[] {
  const skills: SkillInfo[] = [];

  // Add built-in skills
  for (const skill of BUILTIN_SKILLS) {
    skills.push({ ...skill, source: "builtin" });
  }

  // Scan user skills directory (~/.claude/skills/)
  const userSkillsDir = path.join(homedir(), ".claude", "skills");
  skills.push(...scanSkillsDirectory(userSkillsDir, "user"));

  // Scan project skills directory (.claude/skills/)
  if (workspacePath) {
    const projectSkillsDir = path.join(workspacePath, ".claude", "skills");
    skills.push(...scanSkillsDirectory(projectSkillsDir, "project"));
  }

  return skills;
}

export function createDiscoveryCommands(
  sessionManager: SessionManager
): CommandDefinition[] {
  return [
    {
      name: "skills",
      description: "List available Claude Code skills",
      async handler(ctx: CommandContext) {
        // Get the agent's workspace to scan for project skills
        const router = sessionManager.getRouter();
        const agents = router.getAllAgents();
        const workspace = agents[0]?.workspace;

        const skills = getInstalledSkills(workspace);
        const lines = ["📚 Available Skills:", ""];

        // Group by source
        const builtinSkills = skills.filter(s => s.source === "builtin");
        const userSkills = skills.filter(s => s.source === "user");
        const projectSkills = skills.filter(s => s.source === "project");

        if (builtinSkills.length > 0) {
          lines.push("Built-in:");
          for (const skill of builtinSkills) {
            lines.push(`  • /${skill.name} - ${skill.description}`);
          }
          lines.push("");
        }

        if (userSkills.length > 0) {
          lines.push("User (~/.claude/skills/):");
          for (const skill of userSkills) {
            lines.push(`  • /${skill.name} - ${skill.description}`);
          }
          lines.push("");
        }

        if (projectSkills.length > 0) {
          lines.push("Project (.claude/skills/):");
          for (const skill of projectSkills) {
            lines.push(`  • /${skill.name} - ${skill.description}`);
          }
          lines.push("");
        }

        if (userSkills.length === 0 && projectSkills.length === 0) {
          lines.push("No custom skills installed.");
          lines.push("Add skills to ~/.claude/skills/ or .claude/skills/");
          lines.push("");
        }

        lines.push("Invoke a skill by typing its command (e.g., /commit).");

        await ctx.reply(lines.join("\n"));
      },
    },

    {
      name: "plugins",
      aliases: ["plugin"],
      description: "List installed Claude Code plugins",
      async handler(ctx: CommandContext) {
        const lines = ["🔌 Plugins:", ""];

        lines.push("Plugin information is loaded from your Claude Code configuration.");
        lines.push("");
        lines.push("To manage plugins, use the Claude Code CLI:");
        lines.push("  claude plugins list");
        lines.push("  claude plugins install <plugin>");
        lines.push("  claude plugins uninstall <plugin>");

        await ctx.reply(lines.join("\n"));
      },
    },

    {
      name: "mcp",
      description: "Show MCP (Model Context Protocol) server status",
      async handler(ctx: CommandContext) {
        // Get agents config from router
        const router = sessionManager.getRouter();
        const agents = router.getAllAgents();

        const lines = ["🔗 MCP Servers:", ""];

        // Check if any agents have MCP servers configured
        let hasMcpServers = false;

        for (const agent of agents) {
          if (agent.mcpServers && agent.mcpServers.length > 0) {
            hasMcpServers = true;
            lines.push(`Agent: ${agent.name} (${agent.id})`);

            for (const server of agent.mcpServers) {
              const type = server.type || "stdio";
              const status = type === "sse" ? server.url : server.command;
              lines.push(`  • ${server.name} (${type}): ${status}`);
            }
            lines.push("");
          }
        }

        if (!hasMcpServers) {
          lines.push("No MCP servers configured.");
          lines.push("");
          lines.push("Add MCP servers to your agent configuration:");
          lines.push("  agents:");
          lines.push("    list:");
          lines.push("      - id: myagent");
          lines.push("        mcpServers:");
          lines.push("          - name: filesystem");
          lines.push('            command: npx');
          lines.push('            args: ["-y", "@anthropic-ai/mcp-server-filesystem", "/path"]');
        }

        await ctx.reply(lines.join("\n"));
      },
    },

    {
      name: "agents",
      description: "List available agents",
      async handler(ctx: CommandContext) {
        const router = sessionManager.getRouter();
        const agents = router.getAllAgents();

        const lines = ["🤖 Available Agents:", ""];

        for (const agent of agents) {
          lines.push(`• ${agent.id}: ${agent.name}`);
          if (agent.workspace) {
            lines.push(`  Workspace: ${agent.workspace}`);
          }
          if (agent.model) {
            lines.push(`  Model: ${agent.model}`);
          }
          if (agent.mcpServers && agent.mcpServers.length > 0) {
            lines.push(`  MCP Servers: ${agent.mcpServers.map(s => s.name).join(", ")}`);
          }
          if (agent.tools && agent.tools.length > 0) {
            lines.push(`  Tools: ${agent.tools.join(", ")}`);
          }
          if (agent.disallowedTools && agent.disallowedTools.length > 0) {
            lines.push(`  Blocked Tools: ${agent.disallowedTools.join(", ")}`);
          }
          lines.push("");
        }

        await ctx.reply(lines.join("\n"));
      },
    },
  ];
}
