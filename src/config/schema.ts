/**
 * Zod schema for config validation
 */

import { z } from "zod";

const channelTypeSchema = z.enum(["telegram", "discord"]);
const dmPolicySchema = z.enum(["pairing", "allowlist", "open"]);
const permissionModeSchema = z.enum(["default", "acceptEdits", "plan", "bypassPermissions"]);

// MCP Server configuration
const mcpServerConfigSchema = z.object({
  name: z.string().min(1),
  command: z.string().optional(), // For stdio-based MCP servers
  args: z.array(z.string()).optional(),
  env: z.record(z.string()).optional(),
  type: z.enum(["stdio", "sse"]).optional(),
  url: z.string().optional(), // For SSE-based MCP servers
});

const agentConfigSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  workspace: z.string().min(1),
  model: z.string().optional(),
  systemPrompt: z.string().optional(),
  maxTurns: z.number().positive().optional(),
  permissionMode: permissionModeSchema.optional(),
  // Enhanced agent configuration
  mcpServers: z.array(mcpServerConfigSchema).optional(),
  tools: z.array(z.string()).optional(), // Allowed tools (whitelist)
  disallowedTools: z.array(z.string()).optional(), // Blocked tools (blacklist)
});

const bindingMatchSchema = z.object({
  channel: channelTypeSchema.optional(),
  peer: z.string().optional(),
  group: z.string().optional(),
}).optional();

const agentBindingSchema = z.object({
  agentId: z.string().min(1),
  match: bindingMatchSchema,
});

const baseChannelConfigSchema = z.object({
  enabled: z.boolean().default(false),
  dmPolicy: dmPolicySchema.default("pairing"),
  allowFrom: z.array(z.string()).default([]),
});

// Single bot config (for backward compatibility)
const telegramBotConfigSchema = z.object({
  id: z.string().min(1),
  botToken: z.string().min(1),
  agentId: z.string().optional(), // Direct agent binding - all messages from this bot go to this agent
  dmPolicy: dmPolicySchema.optional(),
  allowFrom: z.array(z.string()).optional(),
});

const discordBotConfigSchema = z.object({
  id: z.string().min(1),
  token: z.string().min(1),
  applicationId: z.string().optional(),
  agentId: z.string().optional(), // Direct agent binding
  dmPolicy: dmPolicySchema.optional(),
  allowFrom: z.array(z.string()).optional(),
});

// Telegram channel config - supports both single bot (backward compat) and multi-bot
const telegramConfigSchema = baseChannelConfigSchema.extend({
  botToken: z.string().optional(), // Single bot (backward compat)
  bots: z.array(telegramBotConfigSchema).optional(), // Multi-bot support
}).refine(
  (data) => !data.enabled || (data.botToken && data.botToken.length > 0) || (data.bots && data.bots.length > 0),
  { message: "Either botToken or bots array is required when Telegram is enabled", path: ["botToken"] }
);

// Discord channel config - supports both single bot (backward compat) and multi-bot
const discordConfigSchema = baseChannelConfigSchema.extend({
  token: z.string().optional(), // Single bot (backward compat)
  applicationId: z.string().optional(),
  bots: z.array(discordBotConfigSchema).optional(), // Multi-bot support
}).refine(
  (data) => !data.enabled || (data.token && data.token.length > 0) || (data.bots && data.bots.length > 0),
  { message: "Either token or bots array is required when Discord is enabled", path: ["token"] }
);

const hookDeliverSchema = z.object({
  channel: channelTypeSchema,
  to: z.string().min(1),
});

const hookMatchSchema = z.object({
  path: z.string().min(1),
  event: z.string().optional(),
}).catchall(z.string().optional());

const hookMappingSchema = z.object({
  match: hookMatchSchema,
  agentId: z.string().min(1),
  sessionKey: z.string().min(1),
  messageTemplate: z.string().min(1),
  deliver: hookDeliverSchema.optional(),
});

const exposeConfigSchema = z.object({
  type: z.enum(["tailscale", "ngrok", "cloudflare"]),
  funnel: z.boolean().optional(),
});

const hooksConfigSchema = z.object({
  enabled: z.boolean().default(false),
  bind: z.string().default("127.0.0.1"),
  port: z.number().default(38791),
  token: z.string().optional(),
  mappings: z.array(hookMappingSchema).default([]),
  expose: exposeConfigSchema.optional(),
}).refine(
  (data) => !data.enabled || (data.token && data.token.length > 0),
  { message: "token is required when hooks are enabled", path: ["token"] }
);

// Logging configuration
const loggingConfigSchema = z.object({
  enabled: z.boolean().default(false),
  path: z.string().default("~/.ccb/logs/"),
  format: z.enum(["jsonl", "text"]).default("jsonl"),
  retention: z.string().default("7d"), // e.g., "7d", "30d", "90d"
});

export const bridgeConfigSchema = z.object({
  agents: z.object({
    list: z.array(agentConfigSchema).min(1),
  }),
  bindings: z.array(agentBindingSchema).default([]),
  channels: z.object({
    telegram: telegramConfigSchema.optional(),
    discord: discordConfigSchema.optional(),
  }),
  hooks: hooksConfigSchema.optional(),
  logging: loggingConfigSchema.optional(),
});

export type BridgeConfigInput = z.input<typeof bridgeConfigSchema>;
export type BridgeConfigOutput = z.output<typeof bridgeConfigSchema>;

export function validateConfig(config: unknown): BridgeConfigOutput {
  return bridgeConfigSchema.parse(config);
}

export function safeValidateConfig(config: unknown): { success: true; data: BridgeConfigOutput } | { success: false; error: z.ZodError } {
  const result = bridgeConfigSchema.safeParse(config);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, error: result.error };
}
