/**
 * Config loader - loads and merges configuration
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { validateConfig, safeValidateConfig, type BridgeConfigOutput } from "./schema.js";

const CONFIG_DIR = join(homedir(), ".ccb");
const CONFIG_FILE = join(CONFIG_DIR, "config.json");

/**
 * Expand environment variables in a string (${VAR_NAME} format)
 */
function expandEnvVars(value: string): string {
  return value.replace(/\$\{([^}]+)\}/g, (_, varName) => {
    return process.env[varName] || "";
  });
}

/**
 * Recursively expand env vars in an object
 */
function expandEnvVarsInObject<T>(obj: T): T {
  if (typeof obj === "string") {
    return expandEnvVars(obj) as T;
  }
  if (Array.isArray(obj)) {
    return obj.map(expandEnvVarsInObject) as T;
  }
  if (obj && typeof obj === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = expandEnvVarsInObject(value);
    }
    return result as T;
  }
  return obj;
}

/**
 * Expand ~ to home directory in paths
 */
function expandPath(path: string): string {
  if (path.startsWith("~/")) {
    return join(homedir(), path.slice(2));
  }
  return path;
}

/**
 * Expand paths in agent configs
 */
function expandAgentPaths(config: BridgeConfigOutput): BridgeConfigOutput {
  return {
    ...config,
    agents: {
      ...config.agents,
      list: config.agents.list.map(agent => ({
        ...agent,
        workspace: expandPath(agent.workspace),
      })),
    },
  };
}

export function getConfigDir(): string {
  return CONFIG_DIR;
}

export function getConfigPath(): string {
  return CONFIG_FILE;
}

export function configExists(): boolean {
  return existsSync(CONFIG_FILE);
}

export function loadRawConfig(): unknown {
  if (!existsSync(CONFIG_FILE)) {
    throw new Error(`Config file not found: ${CONFIG_FILE}`);
  }

  const content = readFileSync(CONFIG_FILE, "utf-8");
  return JSON.parse(content);
}

export function loadConfig(): BridgeConfigOutput {
  const raw = loadRawConfig();
  const expanded = expandEnvVarsInObject(raw);
  const validated = validateConfig(expanded);
  return expandAgentPaths(validated);
}

export function loadConfigSafe(): { success: true; config: BridgeConfigOutput } | { success: false; error: string } {
  try {
    if (!existsSync(CONFIG_FILE)) {
      return { success: false, error: `Config file not found: ${CONFIG_FILE}` };
    }

    const raw = loadRawConfig();
    const expanded = expandEnvVarsInObject(raw);
    const result = safeValidateConfig(expanded);

    if (!result.success) {
      const errors = result.error.errors.map(e => `  - ${e.path.join(".")}: ${e.message}`).join("\n");
      return { success: false, error: `Invalid config:\n${errors}` };
    }

    return { success: true, config: expandAgentPaths(result.data) };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { success: false, error: `Failed to load config: ${message}` };
  }
}

export function saveConfig(config: BridgeConfigOutput): void {
  const dir = dirname(CONFIG_FILE);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

export function createDefaultConfig(): BridgeConfigOutput {
  return {
    agents: {
      list: [
        {
          id: "main",
          name: "Main Assistant",
          workspace: join(homedir(), "claude-workspace"),
          model: "claude-sonnet-4-5",
        },
      ],
    },
    bindings: [
      { agentId: "main" },
    ],
    channels: {},
  };
}

export function ensureConfigDir(): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }
}
