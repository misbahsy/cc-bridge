/**
 * Core type definitions for ccb
 */

export type ChannelType = "telegram" | "discord";

// Internal channel type that includes webhook (not exposed in config)
export type InternalChannelType = ChannelType | "webhook";
export type DmPolicy = "pairing" | "allowlist" | "open";
export type SessionStatus = "active" | "idle" | "closed";

// MCP Server configuration
export interface MCPServerConfig {
  name: string;
  command?: string; // For stdio-based MCP servers
  args?: string[];
  env?: Record<string, string>;
  type?: "stdio" | "sse";
  url?: string; // For SSE-based MCP servers
}

export interface AgentConfig {
  id: string;
  name: string;
  workspace: string;
  model?: string;
  systemPrompt?: string;
  maxTurns?: number;
  permissionMode?: "default" | "acceptEdits" | "plan" | "bypassPermissions";
  // Enhanced agent configuration
  mcpServers?: MCPServerConfig[];
  tools?: string[]; // Allowed tools (whitelist)
  disallowedTools?: string[]; // Blocked tools (blacklist)
}

export interface AgentBinding {
  agentId: string;
  match?: {
    channel?: ChannelType;
    peer?: string;
    group?: string;
  };
}

export interface ChannelConfig {
  enabled: boolean;
  dmPolicy: DmPolicy;
  allowFrom: string[];
}

// Bot-specific configurations for multi-bot support
export interface TelegramBotConfig {
  id: string;
  botToken: string;
  agentId?: string; // Direct agent binding
  dmPolicy?: DmPolicy;
  allowFrom?: string[];
}

export interface DiscordBotConfig {
  id: string;
  token: string;
  applicationId?: string;
  agentId?: string; // Direct agent binding
  dmPolicy?: DmPolicy;
  allowFrom?: string[];
}

export interface TelegramConfig extends ChannelConfig {
  botToken?: string; // Single bot (backward compat)
  bots?: TelegramBotConfig[]; // Multi-bot support
}

export interface DiscordConfig extends ChannelConfig {
  token?: string; // Single bot (backward compat)
  applicationId?: string;
  bots?: DiscordBotConfig[]; // Multi-bot support
}

export interface HookMapping {
  match: {
    path: string;
    event?: string;
    [key: string]: string | undefined;
  };
  agentId: string;
  sessionKey: string;
  messageTemplate: string;
  deliver?: {
    channel: ChannelType;
    to: string;
  };
}

export interface HooksConfig {
  enabled: boolean;
  bind: string;
  port: number;
  token?: string; // Required when enabled
  mappings: HookMapping[];
  expose?: {
    type: "tailscale" | "ngrok" | "cloudflare";
    funnel?: boolean;
  };
}

export interface LoggingConfig {
  enabled: boolean;
  path: string;
  format: "jsonl" | "text";
  retention: string; // e.g., "7d", "30d"
}

export interface BridgeConfig {
  agents: {
    list: AgentConfig[];
  };
  bindings: AgentBinding[];
  channels: {
    telegram?: TelegramConfig;
    discord?: DiscordConfig;
  };
  hooks?: HooksConfig;
  logging?: LoggingConfig;
}

export interface SessionInfo {
  id: number;
  chatKey: string;
  sessionName: string;
  sdkSessionId: string;
  workspace?: string;
  agentId: string;
  createdAt: Date;
  lastActive: Date;
  status: SessionStatus;
}

export interface PairingRequest {
  code: string;
  chatKey: string;
  userInfo: UserInfo;
  createdAt: Date;
  expiresAt: Date;
}

export interface UserInfo {
  id: string;
  username?: string;
  displayName?: string;
  channel: ChannelType;
}

export interface IncomingMessage {
  chatKey: string;
  channel: ChannelType;
  userId: string;
  text: string;
  userInfo: UserInfo;
  isGroup: boolean;
  groupId?: string;
  replyTo?: string;
  timestamp: Date;
}

export interface OutgoingMessage {
  chatKey: string;
  channel: ChannelType;
  text: string;
  replyTo?: string;
}

export interface CommandContext {
  command: string;
  args: string[];
  message: IncomingMessage;
  reply: (text: string) => Promise<void>;
}

export interface AdapterEvents {
  message: (msg: IncomingMessage) => Promise<void>;
  command: (ctx: CommandContext) => Promise<void>;
  error: (error: Error) => void;
}

export interface Adapter {
  readonly name: ChannelType;
  start(): Promise<void>;
  stop(): Promise<void>;
  send(chatKey: string, text: string, options?: { replyTo?: string }): Promise<void>;
  on<K extends keyof AdapterEvents>(event: K, handler: AdapterEvents[K]): void;
}
