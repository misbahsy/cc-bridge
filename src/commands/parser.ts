/**
 * Command parser for in-chat commands
 */

import type { CommandContext, IncomingMessage } from "../core/types.js";

// Re-export CommandContext for convenience
export type { CommandContext } from "../core/types.js";

export interface ParsedCommand {
  command: string;
  args: string[];
  rawArgs: string;
}

export interface CommandDefinition {
  name: string;
  aliases?: string[];
  description: string;
  usage?: string;
  handler: (ctx: CommandContext, args: string[]) => Promise<void>;
}

export class CommandParser {
  private commands: Map<string, CommandDefinition> = new Map();

  /**
   * Register a command
   */
  register(definition: CommandDefinition): void {
    this.commands.set(definition.name, definition);

    // Register aliases
    if (definition.aliases) {
      for (const alias of definition.aliases) {
        this.commands.set(alias, definition);
      }
    }
  }

  /**
   * Parse command from message text
   */
  parse(text: string): ParsedCommand | null {
    const trimmed = text.trim();

    if (!trimmed.startsWith("/")) {
      return null;
    }

    // Split on first space to get command and rest
    const spaceIndex = trimmed.indexOf(" ");
    let command: string;
    let rawArgs: string;

    if (spaceIndex === -1) {
      command = trimmed.slice(1).toLowerCase();
      rawArgs = "";
    } else {
      command = trimmed.slice(1, spaceIndex).toLowerCase();
      rawArgs = trimmed.slice(spaceIndex + 1).trim();
    }

    // Handle @botname suffix (Telegram style)
    const atIndex = command.indexOf("@");
    if (atIndex !== -1) {
      command = command.slice(0, atIndex);
    }

    const args = rawArgs ? rawArgs.split(/\s+/) : [];

    return { command, args, rawArgs };
  }

  /**
   * Get command definition
   */
  getCommand(name: string): CommandDefinition | undefined {
    return this.commands.get(name.toLowerCase());
  }

  /**
   * Check if command exists
   */
  hasCommand(name: string): boolean {
    return this.commands.has(name.toLowerCase());
  }

  /**
   * Execute a command
   */
  async execute(ctx: CommandContext): Promise<boolean> {
    const definition = this.commands.get(ctx.command.toLowerCase());

    if (!definition) {
      return false;
    }

    await definition.handler(ctx, ctx.args);
    return true;
  }

  /**
   * Get all command definitions (unique, no aliases)
   */
  getAll(): CommandDefinition[] {
    const seen = new Set<string>();
    const result: CommandDefinition[] = [];

    for (const def of this.commands.values()) {
      if (!seen.has(def.name)) {
        seen.add(def.name);
        result.push(def);
      }
    }

    return result;
  }

  /**
   * Generate help text
   */
  generateHelp(): string {
    const commands = this.getAll();
    const lines = ["Available commands:\n"];

    for (const cmd of commands) {
      const usage = cmd.usage ? ` ${cmd.usage}` : "";
      lines.push(`/${cmd.name}${usage} - ${cmd.description}`);

      if (cmd.aliases && cmd.aliases.length > 0) {
        lines.push(`  Aliases: ${cmd.aliases.map((a) => "/" + a).join(", ")}`);
      }
    }

    return lines.join("\n");
  }
}

/**
 * Check if a message is a command
 */
export function isCommand(message: IncomingMessage): boolean {
  return message.text.trim().startsWith("/");
}
