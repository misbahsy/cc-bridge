/**
 * Pairing code management for secure user onboarding
 */

import { randomBytes } from "node:crypto";
import { BridgeDatabase } from "../db/sqlite.js";
import type { UserInfo, PairingRequest } from "../core/types.js";

const CODE_LENGTH = 6;
const DEFAULT_EXPIRY_MS = 60 * 60 * 1000; // 1 hour

export class PairingManager {
  private db: BridgeDatabase;

  constructor(db: BridgeDatabase) {
    this.db = db;
  }

  /**
   * Generate a pairing code for a new user
   */
  generateCode(chatKey: string, userInfo: UserInfo, expiresInMs: number = DEFAULT_EXPIRY_MS): string {
    // Clean up expired codes first
    this.db.cleanupExpiredPairingRequests();

    // Generate a random alphanumeric code
    const code = randomBytes(Math.ceil(CODE_LENGTH / 2))
      .toString("hex")
      .toUpperCase()
      .slice(0, CODE_LENGTH);

    // Save the pairing request
    this.db.savePairingRequest(code, chatKey, userInfo, expiresInMs);

    return code;
  }

  /**
   * Approve a pairing code and add user to allowlist
   */
  approve(code: string): { success: true; chatKey: string; userInfo: UserInfo } | { success: false; reason: string } {
    const request = this.db.getPairingRequest(code.toUpperCase());

    if (!request) {
      return { success: false, reason: "Invalid or expired pairing code" };
    }

    if (new Date() > request.expiresAt) {
      this.db.deletePairingRequest(code);
      return { success: false, reason: "Pairing code has expired" };
    }

    // Add to allowlist
    this.db.addToAllowlist(request.chatKey, `pairing:${code}`);

    // Remove the pairing request
    this.db.deletePairingRequest(code);

    return {
      success: true,
      chatKey: request.chatKey,
      userInfo: request.userInfo,
    };
  }

  /**
   * Get pairing request by code (without approving)
   */
  getRequest(code: string): PairingRequest | null {
    const request = this.db.getPairingRequest(code.toUpperCase());

    if (!request || new Date() > request.expiresAt) {
      return null;
    }

    return request;
  }

  /**
   * List all pending pairing requests
   */
  listPending(): PairingRequest[] {
    return this.db.listPendingPairingRequests();
  }

  /**
   * Reject/cancel a pairing request
   */
  reject(code: string): boolean {
    const request = this.db.getPairingRequest(code.toUpperCase());
    if (!request) {
      return false;
    }
    this.db.deletePairingRequest(code);
    return true;
  }

  /**
   * Clean up expired pairing requests
   */
  cleanup(): number {
    return this.db.cleanupExpiredPairingRequests();
  }
}
