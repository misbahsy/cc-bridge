/**
 * Control API - HTTP server for desktop app communication
 *
 * Runs on localhost:38792 when bridge starts
 */

import Fastify, { FastifyInstance } from "fastify";
import type { BridgeConfig } from "./types.js";
import type { PairingManager } from "../security/pairing.js";
import type { AllowlistManager } from "../security/allowlist.js";
import type { SessionManager } from "./session-manager.js";
import type { BridgeDatabase } from "../db/sqlite.js";

export interface ControlAPIOptions {
  port?: number;
  bind?: string;
  config: BridgeConfig;
  db: BridgeDatabase;
  pairingManager: PairingManager;
  allowlistManager: AllowlistManager;
  sessionManager: SessionManager;
  onStop?: () => Promise<void>;
}

export interface ChannelStatus {
  name: string;
  enabled: boolean;
  connected: boolean;
  botCount: number;
  bots: Array<{
    id: string;
    username?: string;
    agentId?: string;
  }>;
}

export interface BridgeStatus {
  running: boolean;
  uptime: number;
  channels: ChannelStatus[];
  sessions: {
    active: number;
    total: number;
  };
  pairings: {
    pending: number;
  };
}

export class ControlAPI {
  private server: FastifyInstance;
  private options: ControlAPIOptions;
  private startTime: number;
  private channelStatuses: Map<string, ChannelStatus> = new Map();

  constructor(options: ControlAPIOptions) {
    this.options = options;
    this.startTime = Date.now();
    this.server = Fastify({ logger: false });
    this.setupRoutes();
  }

  /**
   * Update channel status (called by adapters when they connect)
   */
  updateChannelStatus(name: string, status: Partial<ChannelStatus>): void {
    const existing = this.channelStatuses.get(name) || {
      name,
      enabled: false,
      connected: false,
      botCount: 0,
      bots: [],
    };
    this.channelStatuses.set(name, { ...existing, ...status });
  }

  private setupRoutes(): void {
    const { db, pairingManager, allowlistManager, config } = this.options;

    // Health check
    this.server.get("/health", async () => {
      return { ok: true };
    });

    // Get bridge status
    this.server.get("/status", async (): Promise<BridgeStatus> => {
      const sessions = db.listAllSessions();
      const activeSessions = sessions.filter(s => s.status === "active");
      const pendingPairings = db.listPendingPairingRequests();

      const channels: ChannelStatus[] = [];

      // Telegram status
      if (config.channels.telegram?.enabled) {
        const telegramStatus = this.channelStatuses.get("telegram");
        channels.push(telegramStatus || {
          name: "telegram",
          enabled: true,
          connected: false,
          botCount: config.channels.telegram.bots?.length || (config.channels.telegram.botToken ? 1 : 0),
          bots: [],
        });
      }

      // Discord status
      if (config.channels.discord?.enabled) {
        const discordStatus = this.channelStatuses.get("discord");
        channels.push(discordStatus || {
          name: "discord",
          enabled: true,
          connected: false,
          botCount: config.channels.discord.bots?.length || (config.channels.discord.token ? 1 : 0),
          bots: [],
        });
      }

      return {
        running: true,
        uptime: Date.now() - this.startTime,
        channels,
        sessions: {
          active: activeSessions.length,
          total: sessions.length,
        },
        pairings: {
          pending: pendingPairings.length,
        },
      };
    });

    // Get pending pairing requests
    this.server.get("/pairings", async () => {
      const pairings = db.listPendingPairingRequests();
      return {
        pairings: pairings.map(p => ({
          code: p.code,
          chatKey: p.chatKey,
          userInfo: p.userInfo,
          createdAt: p.createdAt.toISOString(),
          expiresAt: p.expiresAt.toISOString(),
        })),
      };
    });

    // Approve a pairing
    this.server.post<{ Params: { code: string } }>("/pairings/:code/approve", async (request, reply) => {
      const { code } = request.params;
      const result = pairingManager.approve(code);

      if (!result.success) {
        reply.status(404);
        return { error: result.reason };
      }

      return { success: true, chatKey: result.chatKey };
    });

    // Deny a pairing
    this.server.post<{ Params: { code: string } }>("/pairings/:code/deny", async (request, reply) => {
      const { code } = request.params;
      const rejected = pairingManager.reject(code);

      if (!rejected) {
        reply.status(404);
        return { error: "Pairing not found or expired" };
      }

      return { success: true };
    });

    // Get sessions
    this.server.get("/sessions", async () => {
      const sessions = db.listAllSessions();
      return {
        sessions: sessions.map(s => ({
          id: s.id,
          chatKey: s.chatKey,
          sessionName: s.sessionName,
          agentId: s.agentId,
          status: s.status,
          createdAt: s.createdAt.toISOString(),
          lastActive: s.lastActive.toISOString(),
        })),
      };
    });

    // Get allowlist
    this.server.get("/allowlist", async () => {
      const allowlist = db.listAllowlist();
      return { allowlist };
    });

    // Add to allowlist
    this.server.post<{ Body: { chatKey: string; userInfo?: { id: string; username?: string; displayName?: string; channel: string } } }>("/allowlist", async (request) => {
      const { chatKey, userInfo } = request.body;
      allowlistManager.add(chatKey, userInfo as any);
      return { success: true };
    });

    // Remove from allowlist
    this.server.delete<{ Params: { chatKey: string } }>("/allowlist/:chatKey", async (request) => {
      const { chatKey } = request.params;
      allowlistManager.remove(decodeURIComponent(chatKey));
      return { success: true };
    });

    // Get config (sanitized - no tokens)
    this.server.get("/config", async () => {
      return {
        agents: config.agents.list.map(a => ({
          id: a.id,
          name: a.name,
          workspace: a.workspace,
          model: a.model,
        })),
        channels: {
          telegram: config.channels.telegram ? {
            enabled: config.channels.telegram.enabled,
            dmPolicy: config.channels.telegram.dmPolicy,
            botCount: config.channels.telegram.bots?.length || (config.channels.telegram.botToken ? 1 : 0),
          } : null,
          discord: config.channels.discord ? {
            enabled: config.channels.discord.enabled,
            dmPolicy: config.channels.discord.dmPolicy,
            botCount: config.channels.discord.bots?.length || (config.channels.discord.token ? 1 : 0),
          } : null,
        },
        logging: config.logging ? {
          enabled: config.logging.enabled,
          path: config.logging.path,
        } : null,
      };
    });

    // Stop the bridge
    this.server.post("/stop", async () => {
      if (this.options.onStop) {
        // Defer the stop so we can respond first
        setTimeout(() => {
          this.options.onStop!();
        }, 100);
      }
      return { success: true, message: "Shutting down..." };
    });

    // CORS for desktop app
    this.server.addHook("onRequest", async (request, reply) => {
      reply.header("Access-Control-Allow-Origin", "*");
      reply.header("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
      reply.header("Access-Control-Allow-Headers", "Content-Type");

      if (request.method === "OPTIONS") {
        reply.status(204).send();
      }
    });
  }

  async start(): Promise<void> {
    const port = this.options.port || 38792;
    const bind = this.options.bind || "127.0.0.1";

    await this.server.listen({ port, host: bind });
  }

  async stop(): Promise<void> {
    await this.server.close();
  }

  getPort(): number {
    return this.options.port || 38792;
  }
}

export function createControlAPI(options: ControlAPIOptions): ControlAPI {
  return new ControlAPI(options);
}
