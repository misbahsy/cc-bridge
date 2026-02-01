/**
 * ccb - Bridge messaging platforms to Claude Code sessions
 *
 * This module exports the main components for programmatic use.
 */

// Core
export { SessionManager } from "./core/session-manager.js";
export type { SendMessageOptions, StreamChunk } from "./core/session-manager.js";
export { Router } from "./core/router.js";
export type {
  AgentConfig,
  AgentBinding,
  BridgeConfig,
  ChannelType,
  ChannelConfig,
  TelegramConfig,
  TelegramBotConfig,
  DiscordConfig,
  DiscordBotConfig,
  HooksConfig,
  HookMapping,
  LoggingConfig,
  MCPServerConfig,
  SessionInfo,
  PairingRequest,
  UserInfo,
  IncomingMessage,
  OutgoingMessage,
  CommandContext,
  Adapter,
  AdapterEvents,
} from "./core/types.js";

// Logging
export { MessageLogger } from "./core/logger.js";
export type { LogEntry, LogOptions } from "./core/logger.js";

// Control API
export { ControlAPI, createControlAPI } from "./core/control-api.js";
export type { ControlAPIOptions, BridgeStatus, ChannelStatus } from "./core/control-api.js";

// Config
export {
  loadConfig,
  loadConfigSafe,
  saveConfig,
  configExists,
  getConfigDir,
  getConfigPath,
  createDefaultConfig,
  ensureConfigDir,
} from "./config/loader.js";
export { validateConfig, safeValidateConfig, bridgeConfigSchema } from "./config/schema.js";

// Database
export { BridgeDatabase, getDatabase, closeDatabase } from "./db/sqlite.js";

// Security
export { PairingManager } from "./security/pairing.js";
export { AllowlistManager } from "./security/allowlist.js";

// Adapters
export { BaseAdapter } from "./adapters/base.js";
export { TelegramAdapter } from "./adapters/telegram.js";
export type { TelegramAdapterOptions } from "./adapters/telegram.js";
export { DiscordAdapter } from "./adapters/discord.js";
export type { DiscordAdapterOptions } from "./adapters/discord.js";

// Commands
export { CommandParser, isCommand } from "./commands/parser.js";
export type { ParsedCommand, CommandDefinition } from "./commands/parser.js";

// Webhooks
export { WebhookServer, createWebhookServer } from "./webhooks/server.js";
export { getDefaultMappings, mergeMappings } from "./webhooks/mappings.js";
