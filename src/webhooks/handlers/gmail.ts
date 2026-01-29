/**
 * Gmail Pub/Sub webhook handler
 */

import type { HookMapping } from "../../core/types.js";

/**
 * Gmail Pub/Sub notification structure
 * https://developers.google.com/gmail/api/guides/push
 */
export interface GmailPubSubMessage {
  message: {
    data: string; // Base64 encoded
    messageId: string;
    publishTime: string;
  };
  subscription: string;
}

/**
 * Decoded Gmail notification data
 */
export interface GmailNotificationData {
  emailAddress: string;
  historyId: number;
}

/**
 * Parsed Gmail message (after fetching from API)
 */
export interface ParsedGmailMessage {
  messageId: string;
  threadId: string;
  from: string;
  to: string;
  subject: string;
  date: string;
  snippet: string;
  body?: string;
  labels: string[];
}

/**
 * Decode Gmail Pub/Sub notification
 */
export function decodeGmailNotification(payload: GmailPubSubMessage): GmailNotificationData {
  const data = Buffer.from(payload.message.data, "base64").toString("utf-8");
  return JSON.parse(data);
}

/**
 * Create Gmail webhook mapping with custom template
 */
export function createGmailMapping(options?: {
  agentId?: string;
  deliverTo?: { channel: "telegram" | "discord"; to: string };
  template?: string;
}): HookMapping {
  return {
    match: { path: "gmail" },
    agentId: options?.agentId || "main",
    sessionKey: "hook:gmail:{{payload.messageId}}",
    messageTemplate:
      options?.template ||
      `New email received:

From: {{payload.from}}
Subject: {{payload.subject}}
Date: {{payload.date}}

{{payload.snippet}}

---
Please analyze this email and suggest an appropriate response.`,
    deliver: options?.deliverTo,
  };
}

/**
 * Helper to extract email address from "Name <email>" format
 */
export function extractEmailAddress(fromHeader: string): string {
  const match = fromHeader.match(/<([^>]+)>/);
  return match ? match[1] : fromHeader;
}

/**
 * Helper to extract sender name from "Name <email>" format
 */
export function extractSenderName(fromHeader: string): string {
  const match = fromHeader.match(/^([^<]+)</);
  return match ? match[1].trim() : fromHeader;
}
