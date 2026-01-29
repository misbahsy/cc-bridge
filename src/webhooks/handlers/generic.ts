/**
 * Generic webhook handler for arbitrary payloads
 */

import type { HookMapping } from "../../core/types.js";

/**
 * Create a generic webhook mapping
 */
export function createGenericMapping(options: {
  path: string;
  agentId?: string;
  sessionKeyTemplate?: string;
  messageTemplate?: string;
  deliverTo?: { channel: "telegram" | "discord"; to: string };
}): HookMapping {
  return {
    match: { path: options.path },
    agentId: options.agentId || "main",
    sessionKey:
      options.sessionKeyTemplate || `hook:${options.path}:{{payload.id}}`,
    messageTemplate:
      options.messageTemplate ||
      `Webhook received from ${options.path}:

\`\`\`json
{{{json payload}}}
\`\`\`

Please process this webhook payload.`,
    deliver: options.deliverTo,
  };
}

/**
 * Format a webhook payload for display
 */
export function formatPayload(payload: unknown, indent: number = 2): string {
  return JSON.stringify(payload, null, indent);
}

/**
 * Extract a nested value from an object using dot notation
 * e.g., "user.profile.name" from { user: { profile: { name: "John" } } }
 */
export function extractNestedValue(obj: unknown, path: string): unknown {
  const keys = path.split(".");
  let current: unknown = obj;

  for (const key of keys) {
    if (current === null || current === undefined) {
      return undefined;
    }
    if (typeof current !== "object") {
      return undefined;
    }
    current = (current as Record<string, unknown>)[key];
  }

  return current;
}

/**
 * Check if payload matches a filter
 */
export function matchesFilter(
  payload: Record<string, unknown>,
  filter: Record<string, unknown>
): boolean {
  for (const [key, expectedValue] of Object.entries(filter)) {
    const actualValue = extractNestedValue(payload, key);

    if (typeof expectedValue === "object" && expectedValue !== null) {
      // Nested filter
      if (
        typeof actualValue !== "object" ||
        actualValue === null ||
        !matchesFilter(
          actualValue as Record<string, unknown>,
          expectedValue as Record<string, unknown>
        )
      ) {
        return false;
      }
    } else if (actualValue !== expectedValue) {
      return false;
    }
  }

  return true;
}

/**
 * Simple webhook mapping for notification-style payloads
 */
export function createNotificationMapping(options: {
  path: string;
  titleField?: string;
  bodyField?: string;
  agentId?: string;
  deliverTo?: { channel: "telegram" | "discord"; to: string };
}): HookMapping {
  const titleField = options.titleField || "title";
  const bodyField = options.bodyField || "body";

  return {
    match: { path: options.path },
    agentId: options.agentId || "main",
    sessionKey: `hook:${options.path}:{{payload.id}}`,
    messageTemplate: `Notification from ${options.path}:

**{{payload.${titleField}}}**

{{payload.${bodyField}}}

---
Please acknowledge and process this notification.`,
    deliver: options.deliverTo,
  };
}
