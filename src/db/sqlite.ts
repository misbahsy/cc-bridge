/**
 * SQLite database for session and pairing persistence
 */

import Database from "better-sqlite3";
import { join } from "node:path";
import { getConfigDir } from "../config/loader.js";
import type { SessionInfo, PairingRequest, UserInfo, ChannelType } from "../core/types.js";

const DB_FILE = join(getConfigDir(), "bridge.db");

export class BridgeDatabase {
  private db: Database.Database;

  constructor(dbPath: string = DB_FILE) {
    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.init();
  }

  private init(): void {
    this.db.exec(`
      -- Sessions table
      CREATE TABLE IF NOT EXISTS sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        chat_key TEXT NOT NULL,
        session_name TEXT NOT NULL DEFAULT 'main',
        sdk_session_id TEXT NOT NULL,
        workspace TEXT,
        agent_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        last_active TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'active',
        UNIQUE(chat_key, session_name)
      );

      -- Active session per chat
      CREATE TABLE IF NOT EXISTS active_sessions (
        chat_key TEXT PRIMARY KEY,
        session_name TEXT NOT NULL DEFAULT 'main'
      );

      -- Pairing requests
      CREATE TABLE IF NOT EXISTS pairing_requests (
        code TEXT PRIMARY KEY,
        chat_key TEXT NOT NULL,
        user_id TEXT NOT NULL,
        username TEXT,
        display_name TEXT,
        channel TEXT NOT NULL,
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL
      );

      -- Allowlist
      CREATE TABLE IF NOT EXISTS allowlist (
        chat_key TEXT PRIMARY KEY,
        added_at TEXT NOT NULL,
        added_by TEXT
      );

      -- Create indexes
      CREATE INDEX IF NOT EXISTS idx_sessions_chat_key ON sessions(chat_key);
      CREATE INDEX IF NOT EXISTS idx_sessions_sdk_id ON sessions(sdk_session_id);
      CREATE INDEX IF NOT EXISTS idx_pairing_expires ON pairing_requests(expires_at);
    `);
  }

  // ==================== Sessions ====================

  getSession(chatKey: string, sessionName: string = "main"): SessionInfo | null {
    const row = this.db.prepare(`
      SELECT * FROM sessions WHERE chat_key = ? AND session_name = ?
    `).get(chatKey, sessionName) as Record<string, unknown> | undefined;

    if (!row) return null;

    return {
      id: row.id as number,
      chatKey: row.chat_key as string,
      sessionName: row.session_name as string,
      sdkSessionId: row.sdk_session_id as string,
      workspace: row.workspace as string | undefined,
      agentId: row.agent_id as string,
      createdAt: new Date(row.created_at as string),
      lastActive: new Date(row.last_active as string),
      status: row.status as "active" | "idle" | "closed",
    };
  }

  getSessionBySdkId(sdkSessionId: string): SessionInfo | null {
    const row = this.db.prepare(`
      SELECT * FROM sessions WHERE sdk_session_id = ?
    `).get(sdkSessionId) as Record<string, unknown> | undefined;

    if (!row) return null;

    return {
      id: row.id as number,
      chatKey: row.chat_key as string,
      sessionName: row.session_name as string,
      sdkSessionId: row.sdk_session_id as string,
      workspace: row.workspace as string | undefined,
      agentId: row.agent_id as string,
      createdAt: new Date(row.created_at as string),
      lastActive: new Date(row.last_active as string),
      status: row.status as "active" | "idle" | "closed",
    };
  }

  saveSession(
    chatKey: string,
    sdkSessionId: string,
    agentId: string,
    sessionName: string = "main",
    workspace?: string
  ): void {
    const now = new Date().toISOString();
    this.db.prepare(`
      INSERT INTO sessions (chat_key, session_name, sdk_session_id, workspace, agent_id, created_at, last_active)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(chat_key, session_name) DO UPDATE SET
        sdk_session_id = excluded.sdk_session_id,
        last_active = excluded.last_active
    `).run(chatKey, sessionName, sdkSessionId, workspace, agentId, now, now);
  }

  updateSessionActivity(chatKey: string, sessionName: string = "main"): void {
    this.db.prepare(`
      UPDATE sessions SET last_active = ? WHERE chat_key = ? AND session_name = ?
    `).run(new Date().toISOString(), chatKey, sessionName);
  }

  listSessions(chatKey: string): SessionInfo[] {
    const rows = this.db.prepare(`
      SELECT * FROM sessions WHERE chat_key = ? ORDER BY last_active DESC
    `).all(chatKey) as Record<string, unknown>[];

    return rows.map(row => ({
      id: row.id as number,
      chatKey: row.chat_key as string,
      sessionName: row.session_name as string,
      sdkSessionId: row.sdk_session_id as string,
      workspace: row.workspace as string | undefined,
      agentId: row.agent_id as string,
      createdAt: new Date(row.created_at as string),
      lastActive: new Date(row.last_active as string),
      status: row.status as "active" | "idle" | "closed",
    }));
  }

  listAllSessions(): SessionInfo[] {
    const rows = this.db.prepare(`
      SELECT * FROM sessions ORDER BY last_active DESC
    `).all() as Record<string, unknown>[];

    return rows.map(row => ({
      id: row.id as number,
      chatKey: row.chat_key as string,
      sessionName: row.session_name as string,
      sdkSessionId: row.sdk_session_id as string,
      workspace: row.workspace as string | undefined,
      agentId: row.agent_id as string,
      createdAt: new Date(row.created_at as string),
      lastActive: new Date(row.last_active as string),
      status: row.status as "active" | "idle" | "closed",
    }));
  }

  deleteSession(chatKey: string, sessionName: string = "main"): void {
    this.db.prepare(`
      DELETE FROM sessions WHERE chat_key = ? AND session_name = ?
    `).run(chatKey, sessionName);
  }

  deleteAllSessions(chatKey: string): void {
    this.db.prepare(`DELETE FROM sessions WHERE chat_key = ?`).run(chatKey);
    this.db.prepare(`DELETE FROM active_sessions WHERE chat_key = ?`).run(chatKey);
  }

  // ==================== Active Sessions ====================

  getActiveSessionName(chatKey: string): string {
    const row = this.db.prepare(`
      SELECT session_name FROM active_sessions WHERE chat_key = ?
    `).get(chatKey) as { session_name: string } | undefined;

    return row?.session_name || "main";
  }

  setActiveSession(chatKey: string, sessionName: string): void {
    this.db.prepare(`
      INSERT INTO active_sessions (chat_key, session_name)
      VALUES (?, ?)
      ON CONFLICT(chat_key) DO UPDATE SET session_name = excluded.session_name
    `).run(chatKey, sessionName);
  }

  // ==================== Pairing ====================

  savePairingRequest(code: string, chatKey: string, userInfo: UserInfo, expiresInMs: number = 3600000): void {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + expiresInMs);

    this.db.prepare(`
      INSERT INTO pairing_requests (code, chat_key, user_id, username, display_name, channel, created_at, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      code,
      chatKey,
      userInfo.id,
      userInfo.username || null,
      userInfo.displayName || null,
      userInfo.channel,
      now.toISOString(),
      expiresAt.toISOString()
    );
  }

  getPairingRequest(code: string): PairingRequest | null {
    const row = this.db.prepare(`
      SELECT * FROM pairing_requests WHERE code = ?
    `).get(code) as Record<string, unknown> | undefined;

    if (!row) return null;

    return {
      code: row.code as string,
      chatKey: row.chat_key as string,
      userInfo: {
        id: row.user_id as string,
        username: row.username as string | undefined,
        displayName: row.display_name as string | undefined,
        channel: row.channel as ChannelType,
      },
      createdAt: new Date(row.created_at as string),
      expiresAt: new Date(row.expires_at as string),
    };
  }

  deletePairingRequest(code: string): void {
    this.db.prepare(`DELETE FROM pairing_requests WHERE code = ?`).run(code);
  }

  cleanupExpiredPairingRequests(): number {
    const result = this.db.prepare(`
      DELETE FROM pairing_requests WHERE expires_at < ?
    `).run(new Date().toISOString());
    return result.changes;
  }

  listPendingPairingRequests(): PairingRequest[] {
    const rows = this.db.prepare(`
      SELECT * FROM pairing_requests WHERE expires_at > ? ORDER BY created_at DESC
    `).all(new Date().toISOString()) as Record<string, unknown>[];

    return rows.map(row => ({
      code: row.code as string,
      chatKey: row.chat_key as string,
      userInfo: {
        id: row.user_id as string,
        username: row.username as string | undefined,
        displayName: row.display_name as string | undefined,
        channel: row.channel as ChannelType,
      },
      createdAt: new Date(row.created_at as string),
      expiresAt: new Date(row.expires_at as string),
    }));
  }

  // ==================== Allowlist ====================

  isAllowed(chatKey: string): boolean {
    const row = this.db.prepare(`
      SELECT 1 FROM allowlist WHERE chat_key = ?
    `).get(chatKey);
    return !!row;
  }

  addToAllowlist(chatKey: string, addedBy?: string): void {
    this.db.prepare(`
      INSERT OR IGNORE INTO allowlist (chat_key, added_at, added_by)
      VALUES (?, ?, ?)
    `).run(chatKey, new Date().toISOString(), addedBy || null);
  }

  removeFromAllowlist(chatKey: string): void {
    this.db.prepare(`DELETE FROM allowlist WHERE chat_key = ?`).run(chatKey);
  }

  listAllowlist(): { chatKey: string; addedAt: Date; addedBy?: string }[] {
    const rows = this.db.prepare(`
      SELECT * FROM allowlist ORDER BY added_at DESC
    `).all() as Record<string, unknown>[];

    return rows.map(row => ({
      chatKey: row.chat_key as string,
      addedAt: new Date(row.added_at as string),
      addedBy: row.added_by as string | undefined,
    }));
  }

  close(): void {
    this.db.close();
  }
}

let dbInstance: BridgeDatabase | null = null;

export function getDatabase(): BridgeDatabase {
  if (!dbInstance) {
    dbInstance = new BridgeDatabase();
  }
  return dbInstance;
}

export function closeDatabase(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}
