/**
 * Webhook server for receiving external events
 */

import Fastify, { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import Handlebars from "handlebars";
import type { HooksConfig, HookMapping, BridgeConfig } from "../core/types.js";
import type { SessionManager } from "../core/session-manager.js";
import type { Adapter } from "../core/types.js";

interface WebhookPayload {
  [key: string]: unknown;
}

export class WebhookServer {
  private app: FastifyInstance;
  private config: HooksConfig;
  private sessionManager: SessionManager;
  private adapters: Map<string, Adapter>;
  private templates: Map<string, HandlebarsTemplateDelegate> = new Map();

  constructor(
    config: HooksConfig,
    sessionManager: SessionManager,
    adapters: Map<string, Adapter>
  ) {
    this.config = config;
    this.sessionManager = sessionManager;
    this.adapters = adapters;
    this.app = Fastify({ logger: false });

    // Pre-compile templates
    for (const mapping of config.mappings) {
      this.templates.set(
        `${mapping.match.path}:message`,
        Handlebars.compile(mapping.messageTemplate)
      );
      this.templates.set(
        `${mapping.match.path}:sessionKey`,
        Handlebars.compile(mapping.sessionKey)
      );
    }
  }

  async start(): Promise<void> {
    // Token verification middleware
    this.app.addHook("preHandler", async (req: FastifyRequest, reply: FastifyReply) => {
      // Skip health check
      if (req.url === "/health") return;

      const token =
        (req.headers["x-webhook-token"] as string) ||
        (req.query as Record<string, string>)?.token;

      if (token !== this.config.token) {
        reply.code(401).send({ error: "Invalid token" });
      }
    });

    // Health check endpoint
    this.app.get("/health", async () => {
      return { status: "ok", timestamp: new Date().toISOString() };
    });

    // Dynamic hook routes
    this.app.post<{ Params: { name: string }; Body: WebhookPayload }>(
      "/hooks/:name",
      async (req, reply) => {
        const hookName = req.params.name;
        const payload = req.body || {};
        const headers = req.headers as Record<string, string>;

        try {
          const result = await this.processWebhook(hookName, payload, headers);
          return result;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          return reply.code(500).send({ error: message });
        }
      }
    );

    // List configured hooks
    this.app.get("/hooks", async () => {
      return {
        hooks: this.config.mappings.map((m) => ({
          path: m.match.path,
          agentId: m.agentId,
          hasDelivery: !!m.deliver,
        })),
      };
    });

    await this.app.listen({
      host: this.config.bind,
      port: this.config.port,
    });

    console.log(`Webhook server listening on ${this.config.bind}:${this.config.port}`);
  }

  async stop(): Promise<void> {
    await this.app.close();
  }

  private async processWebhook(
    hookName: string,
    payload: WebhookPayload,
    headers: Record<string, string>
  ): Promise<{ status: string; sessionKey?: string; response?: string }> {
    // Find matching mapping
    const mapping = this.findMapping(hookName, payload, headers);
    if (!mapping) {
      return { status: "no_mapping_found" };
    }

    // Render session key
    const sessionKeyTemplate = this.templates.get(`${mapping.match.path}:sessionKey`);
    const sessionKey = sessionKeyTemplate
      ? sessionKeyTemplate({ payload, headers })
      : `hook:${hookName}:${Date.now()}`;

    // Render message
    const messageTemplate = this.templates.get(`${mapping.match.path}:message`);
    const message = messageTemplate
      ? messageTemplate({ payload, headers })
      : JSON.stringify(payload, null, 2);

    // Create a fake incoming message
    const fakeMessage = {
      chatKey: sessionKey,
      channel: "webhook" as const,
      userId: "webhook",
      text: message,
      userInfo: {
        id: "webhook",
        username: "webhook",
        displayName: `Webhook: ${hookName}`,
        channel: "webhook" as const,
      },
      isGroup: false,
      timestamp: new Date(),
    };

    // Send to session manager
    let response = "";
    try {
      response = await this.sessionManager.sendMessageSync(fakeMessage as never, {
        agentId: mapping.agentId,
      });
    } catch (error) {
      console.error("Error processing webhook:", error);
      response = `Error: ${error instanceof Error ? error.message : String(error)}`;
    }

    // Optionally deliver to chat channel
    if (mapping.deliver) {
      await this.deliverToChannel(mapping.deliver.channel, mapping.deliver.to, response);
    }

    return { status: "processed", sessionKey, response };
  }

  private findMapping(
    hookName: string,
    payload: WebhookPayload,
    headers: Record<string, string>
  ): HookMapping | undefined {
    for (const mapping of this.config.mappings) {
      if (mapping.match.path !== hookName) {
        continue;
      }

      // Check additional match criteria
      let matches = true;
      for (const [key, value] of Object.entries(mapping.match)) {
        if (key === "path") continue;

        // Check in payload or headers
        const actualValue =
          (payload[key] as string) ||
          headers[key.toLowerCase()] ||
          headers[`x-${key.toLowerCase()}`];

        if (value && actualValue !== value) {
          matches = false;
          break;
        }
      }

      if (matches) {
        return mapping;
      }
    }

    return undefined;
  }

  private async deliverToChannel(
    channel: string,
    to: string,
    message: string
  ): Promise<void> {
    const adapter = this.adapters.get(channel);
    if (!adapter) {
      console.warn(`No adapter for channel: ${channel}`);
      return;
    }

    const chatKey = `${channel}:${to}`;
    await adapter.send(chatKey, message);
  }

  getUrl(hookName: string): string {
    const host = this.config.bind === "0.0.0.0" ? "localhost" : this.config.bind;
    return `http://${host}:${this.config.port}/hooks/${hookName}?token=${this.config.token}`;
  }
}

export function createWebhookServer(
  bridgeConfig: BridgeConfig,
  sessionManager: SessionManager,
  adapters: Map<string, Adapter>
): WebhookServer | null {
  if (!bridgeConfig.hooks?.enabled) {
    return null;
  }

  return new WebhookServer(bridgeConfig.hooks, sessionManager, adapters);
}
