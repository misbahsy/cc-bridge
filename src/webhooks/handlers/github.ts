/**
 * GitHub webhook handler
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import type { HookMapping } from "../../core/types.js";

/**
 * Common GitHub webhook event types
 */
export type GitHubEventType =
  | "push"
  | "pull_request"
  | "issues"
  | "issue_comment"
  | "pull_request_review"
  | "pull_request_review_comment"
  | "release"
  | "workflow_run"
  | "check_run"
  | "check_suite";

/**
 * GitHub webhook headers
 */
export interface GitHubWebhookHeaders {
  "x-github-event": GitHubEventType;
  "x-github-delivery": string;
  "x-hub-signature-256"?: string;
}

/**
 * Verify GitHub webhook signature
 * https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries
 */
export function verifyGitHubSignature(
  payload: string,
  signature: string,
  secret: string
): boolean {
  if (!signature.startsWith("sha256=")) {
    return false;
  }

  const expectedSignature = signature.slice(7);
  const computedSignature = createHmac("sha256", secret).update(payload).digest("hex");

  // Use timing-safe comparison to prevent timing attacks
  try {
    return timingSafeEqual(
      Buffer.from(expectedSignature, "hex"),
      Buffer.from(computedSignature, "hex")
    );
  } catch {
    return false;
  }
}

/**
 * Create GitHub webhook mapping for pull requests
 */
export function createGitHubPRMapping(options?: {
  agentId?: string;
  deliverTo?: { channel: "telegram" | "discord"; to: string };
}): HookMapping {
  return {
    match: { path: "github", event: "pull_request" },
    agentId: options?.agentId || "main",
    sessionKey: "hook:github:pr:{{payload.pull_request.id}}",
    messageTemplate: `GitHub Pull Request:

{{payload.action}} PR #{{payload.number}}
Title: {{payload.pull_request.title}}
Author: @{{payload.pull_request.user.login}}
Repository: {{payload.repository.full_name}}
Branch: {{payload.pull_request.head.ref}} → {{payload.pull_request.base.ref}}

Description:
{{payload.pull_request.body}}

Changed files: {{payload.pull_request.changed_files}}
Additions: +{{payload.pull_request.additions}}
Deletions: -{{payload.pull_request.deletions}}

URL: {{payload.pull_request.html_url}}

---
Please review this pull request and provide feedback.`,
    deliver: options?.deliverTo,
  };
}

/**
 * Create GitHub webhook mapping for issues
 */
export function createGitHubIssueMapping(options?: {
  agentId?: string;
  deliverTo?: { channel: "telegram" | "discord"; to: string };
}): HookMapping {
  return {
    match: { path: "github", event: "issues" },
    agentId: options?.agentId || "main",
    sessionKey: "hook:github:issue:{{payload.issue.id}}",
    messageTemplate: `GitHub Issue:

{{payload.action}} Issue #{{payload.issue.number}}
Title: {{payload.issue.title}}
Author: @{{payload.issue.user.login}}
Repository: {{payload.repository.full_name}}

Description:
{{payload.issue.body}}

Labels: {{#each payload.issue.labels}}{{this.name}}{{#unless @last}}, {{/unless}}{{/each}}

URL: {{payload.issue.html_url}}

---
Please analyze this issue and suggest next steps.`,
    deliver: options?.deliverTo,
  };
}

/**
 * Create GitHub webhook mapping for pushes
 */
export function createGitHubPushMapping(options?: {
  agentId?: string;
  deliverTo?: { channel: "telegram" | "discord"; to: string };
}): HookMapping {
  return {
    match: { path: "github", event: "push" },
    agentId: options?.agentId || "main",
    sessionKey: "hook:github:push:{{payload.after}}",
    messageTemplate: `GitHub Push:

Repository: {{payload.repository.full_name}}
Branch: {{payload.ref}}
Pusher: {{payload.pusher.name}}
Compare: {{payload.compare}}

Commits ({{payload.commits.length}}):
{{#each payload.commits}}
• {{this.id}} - {{this.message}}
  by {{this.author.name}}
{{/each}}

---
Please summarize these changes.`,
    deliver: options?.deliverTo,
  };
}

/**
 * Create GitHub webhook mapping for workflow runs
 */
export function createGitHubWorkflowMapping(options?: {
  agentId?: string;
  deliverTo?: { channel: "telegram" | "discord"; to: string };
}): HookMapping {
  return {
    match: { path: "github", event: "workflow_run" },
    agentId: options?.agentId || "main",
    sessionKey: "hook:github:workflow:{{payload.workflow_run.id}}",
    messageTemplate: `GitHub Workflow Run:

Workflow: {{payload.workflow_run.name}}
Status: {{payload.workflow_run.status}} ({{payload.workflow_run.conclusion}})
Repository: {{payload.repository.full_name}}
Branch: {{payload.workflow_run.head_branch}}
Triggered by: @{{payload.sender.login}}

URL: {{payload.workflow_run.html_url}}

---
{{#if (eq payload.workflow_run.conclusion "failure")}}
Please analyze the workflow failure and suggest fixes.
{{else}}
Workflow completed successfully.
{{/if}}`,
    deliver: options?.deliverTo,
  };
}
