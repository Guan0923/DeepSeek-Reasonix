import { generateToken } from "../auth/crypto";

export interface ConfigBackup {
  id: string;
  label: string;
  format: number;
  appVersion: string;
  platform: string;
  categories: string[];
  ciphertextBytes: number;
  createdAt: string;
}

export interface ConfigBackupInput {
  label: string;
  format: number;
  appVersion: string;
  platform: string;
  categories: string[];
}

interface BackupRow {
  id: string;
  label: string;
  format: number;
  app_version: string;
  platform: string;
  categories: string;
  ciphertext_bytes: number;
  created_at: string;
}

function toBackup(row: BackupRow): ConfigBackup {
  let categories: string[] = [];
  try {
    const parsed: unknown = JSON.parse(row.categories);
    if (Array.isArray(parsed)) categories = parsed.filter((c): c is string => typeof c === "string");
  } catch {
    categories = [];
  }
  return {
    id: row.id,
    label: row.label,
    format: row.format,
    appVersion: row.app_version,
    platform: row.platform,
    categories,
    ciphertextBytes: row.ciphertext_bytes,
    createdAt: row.created_at,
  };
}

export type SaveOutcome = { ok: true; backup: ConfigBackup } | { ok: false; reason: "limit" };

const COLUMNS = "id, label, format, app_version, platform, categories, ciphertext_bytes, created_at";

function objectKey(userId: number, id: string): string {
  return `backups/${userId}/${id}`;
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return Array.from(digest, (b) => b.toString(16).padStart(2, "0")).join("");
}

// Every query is scoped by user_id and every object key embeds it, so one
// account can neither list, read nor delete another's backups by id.
export class ConfigBackupRepo {
  constructor(
    private readonly db: D1Database,
    private readonly bucket: R2Bucket,
  ) {}

  async list(userId: number): Promise<ConfigBackup[]> {
    const { results } = await this.db
      .prepare(`SELECT ${COLUMNS} FROM config_backups WHERE user_id = ?1 ORDER BY created_at DESC`)
      .bind(userId)
      .all<BackupRow>();
    return (results ?? []).map(toBackup);
  }

  // The object is written first and the row second: a row is what makes a
  // backup visible, so a failure between the two leaves an unreferenced object
  // that is removed here rather than a listed backup with nothing behind it.
  async save(userId: number, input: ConfigBackupInput, envelope: Uint8Array, maxCount: number): Promise<SaveOutcome> {
    const id = generateToken();
    const createdAt = new Date().toISOString();
    const sha = await sha256Hex(envelope);
    await this.bucket.put(objectKey(userId, id), envelope, {
      customMetadata: { userId: String(userId), sha256: sha },
    });
    let inserted: { id: string } | null = null;
    try {
      inserted = await this.db
        .prepare(
          `INSERT INTO config_backups (
             id, user_id, label, format, app_version, platform, categories,
             ciphertext_bytes, ciphertext_sha256, created_at
           )
           SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10
           WHERE (SELECT COUNT(*) FROM config_backups WHERE user_id = ?2) < ?11
           RETURNING id`,
        )
        .bind(
          id, userId, input.label, input.format, input.appVersion, input.platform,
          JSON.stringify(input.categories), envelope.byteLength, sha, createdAt, maxCount,
        )
        .first<{ id: string }>();
    } catch (err) {
      await this.bucket.delete(objectKey(userId, id));
      throw err;
    }
    if (!inserted) {
      await this.bucket.delete(objectKey(userId, id));
      return { ok: false, reason: "limit" };
    }
    return {
      ok: true,
      backup: { id, ...input, ciphertextBytes: envelope.byteLength, createdAt },
    };
  }

  async get(userId: number, id: string): Promise<{ backup: ConfigBackup; envelope: Uint8Array } | null> {
    const row = await this.db
      .prepare(`SELECT ${COLUMNS} FROM config_backups WHERE user_id = ?1 AND id = ?2`)
      .bind(userId, id)
      .first<BackupRow>();
    if (!row) return null;
    const object = await this.bucket.get(objectKey(userId, id));
    if (!object) return null;
    return { backup: toBackup(row), envelope: new Uint8Array(await object.arrayBuffer()) };
  }

  async remove(userId: number, id: string): Promise<boolean> {
    const row = await this.db
      .prepare("DELETE FROM config_backups WHERE user_id = ?1 AND id = ?2 RETURNING id")
      .bind(userId, id)
      .first<{ id: string }>();
    if (!row) return false;
    await this.bucket.delete(objectKey(userId, id));
    return true;
  }

  async removeAllForUser(userId: number): Promise<void> {
    const { results } = await this.db
      .prepare("DELETE FROM config_backups WHERE user_id = ?1 RETURNING id")
      .bind(userId)
      .all<{ id: string }>();
    const keys = (results ?? []).map((r) => objectKey(userId, r.id));
    if (keys.length) await this.bucket.delete(keys);
  }
}
