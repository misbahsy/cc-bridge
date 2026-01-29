/**
 * Message Logger - logs incoming/outgoing messages to JSONL files
 */

import * as fs from "fs";
import * as path from "path";
import { homedir } from "os";
import type { LoggingConfig } from "./types.js";

export interface LogEntry {
  timestamp: string;
  chatKey: string;
  direction: "incoming" | "outgoing";
  messageType: "text" | "tool_use" | "tool_result" | "command";
  content: string;
  agentId?: string;
  sessionId?: string;
}

export interface LogOptions {
  chatKey: string;
  direction: "incoming" | "outgoing";
  messageType: "text" | "tool_use" | "tool_result" | "command";
  content: string;
  agentId?: string;
  sessionId?: string;
}

export class MessageLogger {
  private config: LoggingConfig;
  private logPath: string;
  private currentDate: string;
  private writeStream: fs.WriteStream | null = null;

  constructor(config: LoggingConfig) {
    this.config = config;
    this.logPath = this.expandPath(config.path);
    this.currentDate = this.getDateString();

    // Ensure log directory exists
    if (!fs.existsSync(this.logPath)) {
      fs.mkdirSync(this.logPath, { recursive: true });
    }
  }

  /**
   * Expand ~ to home directory
   */
  private expandPath(p: string): string {
    if (p.startsWith("~")) {
      return path.join(homedir(), p.slice(1));
    }
    return p;
  }

  /**
   * Get current date string for log file naming
   */
  private getDateString(): string {
    return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  }

  /**
   * Get the current log file path
   */
  private getLogFilePath(): string {
    const ext = this.config.format === "jsonl" ? "jsonl" : "log";
    return path.join(this.logPath, `messages-${this.currentDate}.${ext}`);
  }

  /**
   * Ensure we have an open write stream for the current date
   */
  private ensureWriteStream(): fs.WriteStream {
    const today = this.getDateString();

    // If date changed, close old stream and create new one
    if (today !== this.currentDate) {
      this.writeStream?.end();
      this.writeStream = null;
      this.currentDate = today;
    }

    // Create new stream if needed
    if (!this.writeStream) {
      const filePath = this.getLogFilePath();
      this.writeStream = fs.createWriteStream(filePath, { flags: "a" });
    }

    return this.writeStream;
  }

  /**
   * Log a message
   */
  log(options: LogOptions): void {
    if (!this.config.enabled) return;

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      chatKey: options.chatKey,
      direction: options.direction,
      messageType: options.messageType,
      content: options.content,
      agentId: options.agentId,
      sessionId: options.sessionId,
    };

    const stream = this.ensureWriteStream();

    if (this.config.format === "jsonl") {
      stream.write(JSON.stringify(entry) + "\n");
    } else {
      // Text format
      const prefix = `[${entry.timestamp}] [${entry.chatKey}] [${entry.direction}]`;
      const agentSuffix = entry.agentId ? ` (agent: ${entry.agentId})` : "";
      stream.write(`${prefix}${agentSuffix}\n${entry.content}\n---\n`);
    }
  }

  /**
   * Read logs for a specific chat key
   */
  readLogs(chatKey?: string, limit: number = 100): LogEntry[] {
    const entries: LogEntry[] = [];

    // Read all log files in reverse chronological order
    const files = fs.readdirSync(this.logPath)
      .filter(f => f.startsWith("messages-") && f.endsWith(".jsonl"))
      .sort()
      .reverse();

    for (const file of files) {
      if (entries.length >= limit) break;

      const filePath = path.join(this.logPath, file);
      const content = fs.readFileSync(filePath, "utf-8");
      const lines = content.trim().split("\n").reverse();

      for (const line of lines) {
        if (entries.length >= limit) break;
        if (!line.trim()) continue;

        try {
          const entry = JSON.parse(line) as LogEntry;
          if (!chatKey || entry.chatKey === chatKey) {
            entries.push(entry);
          }
        } catch {
          // Skip invalid lines
        }
      }
    }

    return entries.reverse();
  }

  /**
   * Get available log files
   */
  getLogFiles(): string[] {
    if (!fs.existsSync(this.logPath)) return [];

    return fs.readdirSync(this.logPath)
      .filter(f => f.startsWith("messages-"))
      .sort()
      .reverse();
  }

  /**
   * Parse retention string (e.g., "7d", "30d")
   */
  private parseRetention(retention: string): number {
    const match = retention.match(/^(\d+)d$/);
    if (!match) return 7; // Default to 7 days
    return parseInt(match[1], 10);
  }

  /**
   * Clean up old log files based on retention policy
   */
  cleanup(): void {
    const retentionDays = this.parseRetention(this.config.retention);
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
    const cutoffStr = cutoffDate.toISOString().slice(0, 10);

    const files = fs.readdirSync(this.logPath)
      .filter(f => f.startsWith("messages-"));

    for (const file of files) {
      // Extract date from filename: messages-YYYY-MM-DD.ext
      const match = file.match(/^messages-(\d{4}-\d{2}-\d{2})\./);
      if (match && match[1] < cutoffStr) {
        fs.unlinkSync(path.join(this.logPath, file));
      }
    }
  }

  /**
   * Close the logger
   */
  async close(): Promise<void> {
    return new Promise((resolve) => {
      if (this.writeStream) {
        this.writeStream.end(() => {
          this.writeStream = null;
          resolve();
        });
      } else {
        resolve();
      }
    });
  }
}
