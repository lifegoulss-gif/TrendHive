import { prisma } from "../prisma.js";
import { Prisma } from "@prisma/client";
import crypto from "crypto";
import { execSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const KEY = Buffer.from(process.env.SESSION_ENCRYPTION_KEY ?? "", "hex");

function encrypt(data: Buffer): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);
  const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, encrypted]).toString("base64");
}

function decrypt(encoded: string): Buffer {
  const data = Buffer.from(encoded, "base64");
  const iv = data.subarray(0, IV_LENGTH);
  const authTag = data.subarray(IV_LENGTH, IV_LENGTH + 16);
  const ciphertext = data.subarray(IV_LENGTH + 16);
  const decipher = crypto.createDecipheriv(ALGORITHM, KEY, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

function compressDir(dir: string): Buffer {
  const tmpFile = path.join(os.tmpdir(), `wa-session-${Date.now()}.tar.gz`);
  execSync(`tar -czf "${tmpFile}" -C "${path.dirname(dir)}" "${path.basename(dir)}"`);
  const buf = fs.readFileSync(tmpFile);
  fs.unlinkSync(tmpFile);
  return buf;
}

function extractToDir(data: Buffer, destDir: string): void {
  const tmpFile = path.join(os.tmpdir(), `wa-session-${Date.now()}.tar.gz`);
  fs.writeFileSync(tmpFile, data);
  fs.mkdirSync(destDir, { recursive: true });
  execSync(`tar -xzf "${tmpFile}" -C "${destDir}"`);
  fs.unlinkSync(tmpFile);
}

/**
 * Custom WhatsApp auth strategy that persists session blobs to Postgres.
 * Replaces LocalAuth which writes to ephemeral disk (breaks on Fly/Railway restarts).
 */
export class PostgresAuth {
  public userDataDir: string;
  public client: any;
  private sessionId: string;

  constructor(sessionId: string) {
    this.sessionId = sessionId;
    this.userDataDir = path.join(os.tmpdir(), `wa-auth-${sessionId}`);
  }

  setup(client: any) {
    this.client = client;
  }

  async afterBrowserInitialized() {}
  async onAuthenticationNeeded() {
    return { failed: false, restart: false, failureEventPayload: undefined };
  }
  async getAuthEventPayload() {}
  async disconnect() {}
  async destroy() {}

  async beforeBrowserInitialized(): Promise<void> {
    const session = await prisma.whatsAppSession.findUnique({
      where: { id: this.sessionId },
      select: { authData: true },
    });

    const encoded = session?.authData as string | null | undefined;
    if (encoded) {
      try {
        const decrypted = decrypt(encoded);
        extractToDir(decrypted, path.dirname(this.userDataDir));
        console.log(`[PostgresAuth] Restored session blob for ${this.sessionId}`);
      } catch (err) {
        console.warn(`[PostgresAuth] Failed to restore session blob, starting fresh:`, err);
        fs.rmSync(this.userDataDir, { recursive: true, force: true });
      }
    }

    fs.mkdirSync(this.userDataDir, { recursive: true });
  }

  async afterAuthReady(): Promise<void> {
    try {
      const compressed = compressDir(this.userDataDir);
      const encrypted = encrypt(compressed);

      await prisma.whatsAppSession.update({
        where: { id: this.sessionId },
        data: { authData: encrypted },
      });

      console.log(`[PostgresAuth] Persisted session blob for ${this.sessionId}`);
    } catch (err) {
      console.error(`[PostgresAuth] Failed to persist session blob:`, err);
    }
  }

  async logout(): Promise<void> {
    await prisma.whatsAppSession.update({
      where: { id: this.sessionId },
      data: { authData: Prisma.JsonNull },
    });

    fs.rmSync(this.userDataDir, { recursive: true, force: true });
    console.log(`[PostgresAuth] Cleared session blob for ${this.sessionId}`);
  }
}
