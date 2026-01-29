/**
 * Webhook mapping utilities
 */

import type { HookMapping } from "../core/types.js";

/**
 * Default Gmail webhook mapping
 */
export const GMAIL_MAPPING: HookMapping = {
  match: { path: "gmail" },
  agentId: "main",
  sessionKey: "hook:gmail:{{payload.messageId}}",
  messageTemplate: `New email received:

From: {{payload.from}}
Subject: {{payload.subject}}
Date: {{payload.date}}

{{payload.snippet}}

---
Please analyze this email and suggest an appropriate response.`,
};

/**
 * Default GitHub webhook mapping for pull requests
 */
export const GITHUB_PR_MAPPING: HookMapping = {
  match: { path: "github", event: "pull_request" },
  agentId: "main",
  sessionKey: "hook:github:pr:{{payload.pull_request.id}}",
  messageTemplate: `GitHub Pull Request Event:

Action: {{payload.action}}
PR #{{payload.number}}: {{payload.pull_request.title}}
Author: {{payload.sender.login}}
Repository: {{payload.repository.full_name}}

Description:
{{payload.pull_request.body}}

---
Please review this pull request.`,
};

/**
 * Default GitHub webhook mapping for issues
 */
export const GITHUB_ISSUE_MAPPING: HookMapping = {
  match: { path: "github", event: "issues" },
  agentId: "main",
  sessionKey: "hook:github:issue:{{payload.issue.id}}",
  messageTemplate: `GitHub Issue Event:

Action: {{payload.action}}
Issue #{{payload.issue.number}}: {{payload.issue.title}}
Author: {{payload.sender.login}}
Repository: {{payload.repository.full_name}}

Description:
{{payload.issue.body}}

Labels: {{#each payload.issue.labels}}{{this.name}}{{#unless @last}}, {{/unless}}{{/each}}

---
Please analyze this issue.`,
};

/**
 * Default GitHub webhook mapping for pushes
 */
export const GITHUB_PUSH_MAPPING: HookMapping = {
  match: { path: "github", event: "push" },
  agentId: "main",
  sessionKey: "hook:github:push:{{payload.after}}",
  messageTemplate: `GitHub Push Event:

Repository: {{payload.repository.full_name}}
Branch: {{payload.ref}}
Pusher: {{payload.pusher.name}}

Commits:
{{#each payload.commits}}
- {{this.message}} ({{this.author.name}})
{{/each}}

---
Please summarize these changes.`,
};

/**
 * Generic webhook mapping template
 */
export const GENERIC_MAPPING: HookMapping = {
  match: { path: "generic" },
  agentId: "main",
  sessionKey: "hook:generic:{{payload.id}}",
  messageTemplate: `Webhook received:

{{#each payload}}
{{@key}}: {{this}}
{{/each}}

---
Please process this webhook payload.`,
};

/**
 * Calendar event mapping
 */
export const CALENDAR_MAPPING: HookMapping = {
  match: { path: "calendar" },
  agentId: "main",
  sessionKey: "hook:calendar:{{payload.eventId}}",
  messageTemplate: `Calendar Event:

Title: {{payload.title}}
Start: {{payload.start}}
End: {{payload.end}}
Location: {{payload.location}}
Description: {{payload.description}}

Attendees:
{{#each payload.attendees}}
- {{this.email}} ({{this.status}})
{{/each}}

---
Please prepare a summary or action items for this event.`,
};

/**
 * Get default mappings for common services
 */
export function getDefaultMappings(): HookMapping[] {
  return [
    GMAIL_MAPPING,
    GITHUB_PR_MAPPING,
    GITHUB_ISSUE_MAPPING,
    GITHUB_PUSH_MAPPING,
    CALENDAR_MAPPING,
    GENERIC_MAPPING,
  ];
}

/**
 * Merge user mappings with defaults (user mappings take precedence)
 */
export function mergeMappings(userMappings: HookMapping[]): HookMapping[] {
  const defaults = getDefaultMappings();
  const userPaths = new Set(userMappings.map((m) => m.match.path));

  // Include defaults that aren't overridden
  const merged = [...userMappings];
  for (const defaultMapping of defaults) {
    if (!userPaths.has(defaultMapping.match.path)) {
      merged.push(defaultMapping);
    }
  }

  return merged;
}
