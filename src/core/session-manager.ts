/**
 * Session Manager - handles Claude Code SDK session lifecycle
 */

import {
  query,
  type SDKMessage,
  type SDKAssistantMessage,
  type Options,
} from "@anthropic-ai/claude-agent-sdk";
import { BridgeDatabase } from "../db/sqlite.js";
import { Router } from "./router.js";
import type { AgentConfig, BridgeConfig, IncomingMessage, SessionInfo } from "./types.js";

export interface SendMessageOptions {
  agentId?: string;
  sessionName?: string;
}

export interface StreamChunk {
  type: "text" | "tool_use" | "tool_result" | "error" | "done";
  text?: string;
  toolName?: string;
  error?: string;
}

interface CachedSession {
  id: string;
  agentConfig: AgentConfig;
  chatKey: string;
  sessionName: string;
}

export class SessionManager {
  private db: BridgeDatabase;
  private router: Router;
  private activeSessions: Map<string, CachedSession> = new Map();

  constructor(config: BridgeConfig, db: BridgeDatabase) {
    this.db = db;
    this.router = new Router(config);
  }

  /**
   * Get or create a session for a chat
   */
  async getOrCreateSession(
    chatKey: string,
    agentConfig: AgentConfig,
    sessionName: string = "main"
  ): Promise<CachedSession> {
    const fullKey = sessionName === "main" ? chatKey : `${chatKey}:${sessionName}`;

    // Check if we have an active session in memory
    const cached = this.activeSessions.get(fullKey);
    if (cached) {
      return cached;
    }

    // Check if we have a session ID in the database
    const existingSession = this.db.getSession(chatKey, sessionName);

    if (existingSession) {
      // Use existing session ID
      const session: CachedSession = {
        id: existingSession.sdkSessionId,
        agentConfig,
        chatKey,
        sessionName,
      };
      this.activeSessions.set(fullKey, session);
      this.db.updateSessionActivity(chatKey, sessionName);
      return session;
    }

    // Create new session
    return this.createNewSession(chatKey, agentConfig, sessionName);
  }

  /**
   * Create a new session
   */
  private async createNewSession(
    chatKey: string,
    agentConfig: AgentConfig,
    sessionName: string
  ): Promise<CachedSession> {
    const fullKey = sessionName === "main" ? chatKey : `${chatKey}:${sessionName}`;

    // Generate a placeholder session ID - will be replaced with actual SDK ID
    const sessionId = `ccb-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    // Save placeholder session info - will be updated after first message
    this.db.saveSession(chatKey, sessionId, agentConfig.id, sessionName, agentConfig.workspace);

    const session: CachedSession = {
      id: sessionId,
      agentConfig,
      chatKey,
      sessionName,
    };

    this.activeSessions.set(fullKey, session);
    return session;
  }

  /**
   * Send a message and stream the response
   */
  async *sendMessage(
    message: IncomingMessage,
    options: SendMessageOptions = {}
  ): AsyncGenerator<StreamChunk> {
    const { sessionName = this.db.getActiveSessionName(message.chatKey) } = options;

    // Get the appropriate agent
    let agent: AgentConfig;
    if (options.agentId) {
      const specified = this.router.getAgent(options.agentId);
      if (!specified) {
        yield { type: "error", error: `Unknown agent: ${options.agentId}` };
        return;
      }
      agent = specified;
    } else {
      agent = this.router.routeMessage(message);
    }

    // Get existing session info for resume
    const existingSession = this.db.getSession(message.chatKey, sessionName);
    const resumeSessionId = existingSession?.sdkSessionId;

    // Build system prompt
    const systemParts: string[] = [];
    if (agent.systemPrompt) {
      systemParts.push(agent.systemPrompt);
    }
    systemParts.push(
      `User info: ${message.userInfo.displayName || message.userInfo.username || message.userId} via ${message.channel}`
    );

    try {
      // Build query options
      const queryOptions: Options = {
        model: agent.model,
        cwd: agent.workspace,
        permissionMode: agent.permissionMode || "acceptEdits",
        maxTurns: agent.maxTurns || 10,
      };

      // Set system prompt
      if (systemParts.length > 0) {
        queryOptions.systemPrompt = systemParts.join("\n\n");
      }

      // Resume existing session if available
      if (resumeSessionId && !resumeSessionId.startsWith("ccb-")) {
        queryOptions.resume = resumeSessionId;
      }

      // Pass agent's tool configuration if specified
      if (agent.tools && agent.tools.length > 0) {
        queryOptions.allowedTools = agent.tools;
      }
      if (agent.disallowedTools && agent.disallowedTools.length > 0) {
        queryOptions.disallowedTools = agent.disallowedTools;
      }

      // Pass agent's MCP servers if specified
      // SDK expects Record<string, McpServerConfig> where key is server name
      if (agent.mcpServers && agent.mcpServers.length > 0) {
        const mcpServersRecord: Record<string, unknown> = {};
        for (const server of agent.mcpServers) {
          if (server.type === "sse" && server.url) {
            mcpServersRecord[server.name] = {
              type: "sse" as const,
              url: server.url,
            };
          } else {
            mcpServersRecord[server.name] = {
              command: server.command || "",
              args: server.args || [],
              env: server.env,
            };
          }
        }
        // Cast to any to bypass SDK's strict typing - the actual shape is correct
        queryOptions.mcpServers = mcpServersRecord as Record<string, never>;
      }

      // Use the query function with streaming
      const response = query({
        prompt: message.text,
        options: queryOptions,
      });

      let sessionId = resumeSessionId;

      // Stream the response
      for await (const event of response) {
        const processed = this.processSDKMessage(event);
        if (processed) {
          yield processed;
        }

        // Extract session ID from result
        if (event.type === "result") {
          sessionId = event.session_id;
        }
      }

      // Save/update session
      if (sessionId) {
        this.db.saveSession(message.chatKey, sessionId, agent.id, sessionName, agent.workspace);
      }

      yield { type: "done" };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      yield { type: "error", error: errorMessage };
    }
  }

  /**
   * Process an SDK message and extract relevant content
   */
  private processSDKMessage(event: SDKMessage): StreamChunk | null {
    if (event.type === "assistant") {
      const assistantMsg = event as SDKAssistantMessage;
      // Extract text from assistant message
      if (assistantMsg.message?.content) {
        for (const block of assistantMsg.message.content) {
          if (block.type === "text" && "text" in block) {
            return { type: "text", text: block.text };
          } else if (block.type === "tool_use" && "name" in block) {
            return { type: "tool_use", toolName: block.name };
          }
        }
      }
    }
    // Note: Don't extract text from "result" messages - it duplicates the assistant message content
    // The result message is only used for metadata like session_id
    return null;
  }

  /**
   * Send a message and get the full response (non-streaming)
   */
  async sendMessageSync(message: IncomingMessage, options: SendMessageOptions = {}): Promise<string> {
    const chunks: string[] = [];

    for await (const chunk of this.sendMessage(message, options)) {
      if (chunk.type === "text" && chunk.text) {
        chunks.push(chunk.text);
      } else if (chunk.type === "error") {
        throw new Error(chunk.error);
      }
    }

    return chunks.join("");
  }

  /**
   * Create a new named session
   */
  async createNamedSession(chatKey: string, name: string, agentId?: string): Promise<void> {
    const agent = agentId ? this.router.getAgent(agentId) : this.router.getAllAgents()[0];

    if (!agent) {
      throw new Error("No agent configured");
    }

    // Create placeholder session
    const sessionId = `ccb-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    this.db.saveSession(chatKey, sessionId, agent.id, name, agent.workspace);
    this.db.setActiveSession(chatKey, name);
  }

  /**
   * Switch to a different session
   */
  switchSession(chatKey: string, sessionName: string): boolean {
    const session = this.db.getSession(chatKey, sessionName);
    if (!session) {
      return false;
    }
    this.db.setActiveSession(chatKey, sessionName);
    return true;
  }

  /**
   * List all sessions for a chat
   */
  listSessions(chatKey: string): SessionInfo[] {
    return this.db.listSessions(chatKey);
  }

  /**
   * List all sessions
   */
  listAllSessions(): SessionInfo[] {
    return this.db.listAllSessions();
  }

  /**
   * Delete a session
   */
  deleteSession(chatKey: string, sessionName: string = "main"): void {
    const fullKey = sessionName === "main" ? chatKey : `${chatKey}:${sessionName}`;
    this.activeSessions.delete(fullKey);
    this.db.deleteSession(chatKey, sessionName);
  }

  /**
   * Reset all sessions for a chat (create fresh start)
   */
  resetChat(chatKey: string): void {
    // Clear from memory
    const sessions = this.db.listSessions(chatKey);
    for (const session of sessions) {
      const fullKey = session.sessionName === "main" ? chatKey : `${chatKey}:${session.sessionName}`;
      this.activeSessions.delete(fullKey);
    }

    // Clear from database
    this.db.deleteAllSessions(chatKey);
  }

  /**
   * Get active session name for a chat
   */
  getActiveSessionName(chatKey: string): string {
    return this.db.getActiveSessionName(chatKey);
  }

  /**
   * Get router instance
   */
  getRouter(): Router {
    return this.router;
  }

  /**
   * Cleanup resources
   */
  cleanup(): void {
    this.activeSessions.clear();
  }
}
