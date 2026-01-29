/**
 * Router - handles agent binding and routing logic
 */

import type { AgentConfig, AgentBinding, BridgeConfig, ChannelType, IncomingMessage } from "./types.js";

export class Router {
  private agents: Map<string, AgentConfig>;
  private bindings: AgentBinding[];
  private defaultAgentId: string;

  constructor(config: BridgeConfig) {
    this.agents = new Map();
    for (const agent of config.agents.list) {
      this.agents.set(agent.id, agent);
    }

    this.bindings = config.bindings;

    // Default agent is the first one or the one with no match criteria
    const defaultBinding = this.bindings.find(b => !b.match);
    this.defaultAgentId = defaultBinding?.agentId || config.agents.list[0].id;
  }

  /**
   * Get agent config by ID
   */
  getAgent(agentId: string): AgentConfig | undefined {
    return this.agents.get(agentId);
  }

  /**
   * Get all agents
   */
  getAllAgents(): AgentConfig[] {
    return Array.from(this.agents.values());
  }

  /**
   * Find the appropriate agent for a message
   */
  routeMessage(message: IncomingMessage): AgentConfig {
    const agentId = this.findAgentId(message.channel, message.userId, message.groupId);
    const agent = this.agents.get(agentId);

    if (!agent) {
      // Fallback to default agent
      const defaultAgent = this.agents.get(this.defaultAgentId);
      if (!defaultAgent) {
        throw new Error(`No agent configured for routing`);
      }
      return defaultAgent;
    }

    return agent;
  }

  /**
   * Find agent ID for a chat key
   */
  findAgentId(channel: ChannelType, peerId: string, groupId?: string): string {
    // Check bindings in order, first match wins
    for (const binding of this.bindings) {
      if (this.matchesBinding(binding, channel, peerId, groupId)) {
        return binding.agentId;
      }
    }

    return this.defaultAgentId;
  }

  /**
   * Check if a binding matches the given criteria
   */
  private matchesBinding(
    binding: AgentBinding,
    channel: ChannelType,
    peerId: string,
    groupId?: string
  ): boolean {
    // No match criteria means it matches everything (default)
    if (!binding.match) {
      return true;
    }

    const match = binding.match;

    // If channel is specified, it must match
    if (match.channel && match.channel !== channel) {
      return false;
    }

    // If peer is specified, it must match
    if (match.peer && match.peer !== peerId) {
      return false;
    }

    // If group is specified, it must match
    if (match.group && match.group !== groupId) {
      return false;
    }

    return true;
  }

  /**
   * Parse a chat key into its components
   * Supports both single-bot and multi-bot formats:
   * - Single-bot: telegram:123, telegram:group:123, discord:123, discord:channel:123
   * - Multi-bot: telegram:botId:123, telegram:botId:group:123, discord:botId:123, discord:botId:channel:123
   */
  static parseChatKey(chatKey: string): {
    channel: ChannelType;
    botId?: string;
    id: string;
    sessionName?: string;
    isGroup: boolean;
  } {
    const parts = chatKey.split(":");

    if (parts.length < 2) {
      throw new Error(`Invalid chat key format: ${chatKey}`);
    }

    const channel = parts[0] as ChannelType;

    // Detect multi-bot format by checking if parts[1] is "group"/"channel" or a botId
    // Single-bot Telegram: telegram:123, telegram:group:123
    // Multi-bot Telegram: telegram:botId:123, telegram:botId:group:123
    // Single-bot Discord: discord:123, discord:channel:123
    // Multi-bot Discord: discord:botId:123, discord:botId:channel:123

    if (channel === "telegram") {
      if (parts[1] === "group") {
        // Single-bot group: telegram:group:groupId[:sessionName]
        return {
          channel,
          id: parts[2],
          sessionName: parts[3],
          isGroup: true,
        };
      } else if (parts.length >= 3 && parts[2] === "group") {
        // Multi-bot group: telegram:botId:group:groupId[:sessionName]
        return {
          channel,
          botId: parts[1],
          id: parts[3],
          sessionName: parts[4],
          isGroup: true,
        };
      } else if (parts.length >= 3 && !isNaN(Number(parts[2]))) {
        // Multi-bot DM: telegram:botId:userId[:sessionName]
        return {
          channel,
          botId: parts[1],
          id: parts[2],
          sessionName: parts[3],
          isGroup: false,
        };
      } else {
        // Single-bot DM: telegram:userId[:sessionName]
        return {
          channel,
          id: parts[1],
          sessionName: parts[2],
          isGroup: false,
        };
      }
    }

    if (channel === "discord") {
      if (parts[1] === "channel") {
        // Single-bot channel: discord:channel:channelId[:sessionName]
        return {
          channel,
          id: parts[2],
          sessionName: parts[3],
          isGroup: true,
        };
      } else if (parts.length >= 3 && parts[2] === "channel") {
        // Multi-bot channel: discord:botId:channel:channelId[:sessionName]
        return {
          channel,
          botId: parts[1],
          id: parts[3],
          sessionName: parts[4],
          isGroup: true,
        };
      } else if (parts.length >= 3) {
        // Multi-bot DM: discord:botId:userId[:sessionName]
        return {
          channel,
          botId: parts[1],
          id: parts[2],
          sessionName: parts[3],
          isGroup: false,
        };
      } else {
        // Single-bot DM: discord:userId[:sessionName]
        return {
          channel,
          id: parts[1],
          sessionName: parts[2],
          isGroup: false,
        };
      }
    }

    // WhatsApp (no multi-bot support yet)
    const isGroup = parts[1] === "group";
    if (isGroup) {
      return {
        channel,
        id: parts[2],
        sessionName: parts[3],
        isGroup: true,
      };
    }

    return {
      channel,
      id: parts[1],
      sessionName: parts[2],
      isGroup: false,
    };
  }

  /**
   * Build a chat key from components
   * Supports both single-bot and multi-bot formats
   */
  static buildChatKey(
    channel: ChannelType,
    id: string,
    options?: { botId?: string; isGroup?: boolean; sessionName?: string }
  ): string {
    const parts: string[] = [channel];

    // Add bot ID for multi-bot format
    if (options?.botId) {
      parts.push(options.botId);
    }

    // Add group/channel indicator
    if (options?.isGroup) {
      parts.push(channel === "discord" ? "channel" : "group");
    }

    parts.push(id);

    if (options?.sessionName && options.sessionName !== "main") {
      parts.push(options.sessionName);
    }

    return parts.join(":");
  }
}
