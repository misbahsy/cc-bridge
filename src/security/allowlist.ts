/**
 * Allowlist management for access control
 */

import { BridgeDatabase } from "../db/sqlite.js";
import type { ChannelConfig, UserInfo, ChannelType } from "../core/types.js";

export class AllowlistManager {
  private db: BridgeDatabase;

  constructor(db: BridgeDatabase) {
    this.db = db;
  }

  /**
   * Check if a chat is allowed based on policy and allowlist
   */
  isAllowed(
    chatKey: string,
    userInfo: UserInfo,
    channelConfig?: ChannelConfig
  ): { allowed: boolean; reason?: string } {
    // If no config, deny by default
    if (!channelConfig) {
      return { allowed: false, reason: "Channel not configured" };
    }

    // If channel is disabled, deny
    if (!channelConfig.enabled) {
      return { allowed: false, reason: "Channel is disabled" };
    }

    const policy = channelConfig.dmPolicy;

    switch (policy) {
      case "open":
        // Anyone can use the bot
        return { allowed: true };

      case "pairing":
        // Check if user is in allowlist (via pairing or manual add)
        if (this.db.isAllowed(chatKey)) {
          return { allowed: true };
        }
        // Also check config allowFrom
        if (this.isInConfigAllowlist(userInfo, channelConfig)) {
          return { allowed: true };
        }
        return { allowed: false, reason: "Pairing required" };

      case "allowlist":
        // Strict allowlist - only pre-configured users
        if (this.db.isAllowed(chatKey)) {
          return { allowed: true };
        }
        if (this.isInConfigAllowlist(userInfo, channelConfig)) {
          return { allowed: true };
        }
        return { allowed: false, reason: "Not in allowlist" };

      default:
        return { allowed: false, reason: "Unknown policy" };
    }
  }

  /**
   * Check if user is in the config's allowFrom list
   */
  private isInConfigAllowlist(userInfo: UserInfo, config: ChannelConfig): boolean {
    if (!config.allowFrom || config.allowFrom.length === 0) {
      return false;
    }

    // Check against user ID, username
    return config.allowFrom.some(
      allowed =>
        allowed === userInfo.id ||
        allowed === userInfo.username ||
        (userInfo.username && allowed.toLowerCase() === userInfo.username.toLowerCase())
    );
  }

  /**
   * Add a chat to the allowlist
   */
  add(chatKey: string, addedBy?: string): void {
    this.db.addToAllowlist(chatKey, addedBy);
  }

  /**
   * Remove a chat from the allowlist
   */
  remove(chatKey: string): void {
    this.db.removeFromAllowlist(chatKey);
  }

  /**
   * Check if a chat is in the allowlist
   */
  check(chatKey: string): boolean {
    return this.db.isAllowed(chatKey);
  }

  /**
   * List all allowlist entries
   */
  list(): { chatKey: string; addedAt: Date; addedBy?: string }[] {
    return this.db.listAllowlist();
  }

  /**
   * Build a chat key for allowlist lookup
   */
  static buildChatKey(channel: ChannelType, userId: string, isGroup: boolean = false, groupId?: string): string {
    if (isGroup && groupId) {
      return `${channel}:group:${groupId}`;
    }
    return `${channel}:${userId}`;
  }
}
