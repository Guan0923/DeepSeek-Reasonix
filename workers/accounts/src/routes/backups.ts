import { Hono } from "hono";
import type { AppEnv } from "../env";
import { ConfigBackupRepo } from "../db/configBackups";
import { currentUser } from "../http/auth";
import { ApiError } from "../http/errors";
import { ConfigBackupIdSchema, ConfigBackupUploadSchema, parseBody } from "../lib/validation";
import { CONFIG_BACKUP_MAX_BYTES, CONFIG_BACKUP_MAX_COUNT } from "../config";

// Mounted under /me, so requireAuth has already run. The service stores an
// envelope the client sealed with a passphrase it never sends here.
const backups = new Hono<AppEnv>();

const ENVELOPE_MAGIC = [0x52, 0x58, 0x43, 0x42];

function repo(c: { env: AppEnv["Bindings"] }): ConfigBackupRepo {
  if (!c.env.BACKUPS) throw new ApiError(503, "backups_unavailable", "Backups are not available right now.");
  return new ConfigBackupRepo(c.env.DB, c.env.BACKUPS);
}

function backupId(raw: string): string {
  const parsed = ConfigBackupIdSchema.safeParse(raw);
  if (!parsed.success) throw new ApiError(404, "backup_not_found", "That backup does not exist.");
  return parsed.data;
}

function decodeEnvelope(text: string): Uint8Array {
  let bin: string;
  try {
    bin = atob(text);
  } catch {
    throw new ApiError(400, "invalid_envelope", "The backup is not valid base64.");
  }
  if (bin.length > CONFIG_BACKUP_MAX_BYTES) {
    throw new ApiError(413, "backup_too_large", "The backup is larger than the service accepts.");
  }
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  if (!ENVELOPE_MAGIC.every((b, i) => bytes[i] === b)) {
    throw new ApiError(400, "invalid_envelope", "That is not a Reasonix backup.");
  }
  return bytes;
}

function encodeEnvelope(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(s);
}

const limits = { maxCount: CONFIG_BACKUP_MAX_COUNT, maxBytes: CONFIG_BACKUP_MAX_BYTES };

backups.get("/", async (c) => {
  const user = currentUser(c);
  return c.json({ backups: await repo(c).list(user.id), limits });
});

backups.post("/", async (c) => {
  const user = currentUser(c);
  const store = repo(c);
  const { envelope, ...meta } = await parseBody(c, ConfigBackupUploadSchema);
  const bytes = decodeEnvelope(envelope);
  const saved = await store.save(user.id, meta, bytes, CONFIG_BACKUP_MAX_COUNT);
  if (!saved.ok) {
    throw new ApiError(409, "backup_limit_reached", `An account keeps at most ${CONFIG_BACKUP_MAX_COUNT} backups.`);
  }
  return c.json({ backup: saved.backup }, 201);
});

backups.get("/:id", async (c) => {
  const user = currentUser(c);
  const found = await repo(c).get(user.id, backupId(c.req.param("id")));
  if (!found) throw new ApiError(404, "backup_not_found", "That backup does not exist.");
  return c.json({ backup: found.backup, envelope: encodeEnvelope(found.envelope) });
});

backups.delete("/:id", async (c) => {
  const user = currentUser(c);
  const removed = await repo(c).remove(user.id, backupId(c.req.param("id")));
  if (!removed) throw new ApiError(404, "backup_not_found", "That backup does not exist.");
  return c.json({ ok: true });
});

export default backups;
