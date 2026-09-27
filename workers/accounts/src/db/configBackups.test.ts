import { describe, expect, it } from "vitest";
import migration from "../../migrations/0005_config_backups.sql?raw";
import { ConfigBackupRepo } from "./configBackups";

interface Statement {
  sql: string;
  values: unknown[];
}

function fakes(firstRows: unknown[] = [], allRows: unknown[][] = []) {
  const statements: Statement[] = [];
  const rows = [...firstRows];
  const lists = [...allRows];
  const db = {
    prepare(sql: string) {
      const record: Statement = { sql, values: [] };
      statements.push(record);
      return {
        bind(...values: unknown[]) { record.values = values; return this; },
        async first() { return rows.shift() ?? null; },
        async all() { return { results: lists.shift() ?? [] }; },
        async run() { return { meta: { changes: 1 } }; },
      };
    },
  } as unknown as D1Database;
  const objects = new Map<string, Uint8Array>();
  const deleted: string[] = [];
  const bucket = {
    async put(key: string, value: Uint8Array) { objects.set(key, value); },
    async get(key: string) {
      const v = objects.get(key);
      return v ? { arrayBuffer: async () => v.slice().buffer } : null;
    },
    async delete(keys: string | string[]) {
      for (const k of Array.isArray(keys) ? keys : [keys]) { deleted.push(k); objects.delete(k); }
    },
  } as unknown as R2Bucket;
  return { db, bucket, statements, objects, deleted };
}

const meta = { label: "laptop", format: 1, appVersion: "2.20.5", platform: "darwin/arm64", categories: ["settings"] };
const envelope = new Uint8Array([0x52, 0x58, 0x43, 0x42, 1, 2, 3]);

describe("ConfigBackupRepo", () => {
  it("stores the envelope under the owner's prefix and the metadata beside it", async () => {
    const f = fakes([{ id: "x" }]);
    const out = await new ConfigBackupRepo(f.db, f.bucket).save(7, meta, envelope, 10);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.backup.ciphertextBytes).toBe(envelope.byteLength);
    expect([...f.objects.keys()]).toEqual([`backups/7/${out.backup.id}`]);
    expect(f.statements[0]?.sql).toContain("< ?11");
    expect(f.statements[0]?.values[1]).toBe(7);
  });

  it("removes the object again when the account is at its limit", async () => {
    const f = fakes([null]);
    const out = await new ConfigBackupRepo(f.db, f.bucket).save(7, meta, envelope, 10);
    expect(out).toEqual({ ok: false, reason: "limit" });
    expect(f.objects.size).toBe(0);
    expect(f.deleted).toHaveLength(1);
  });

  it("reads and deletes only within the caller's own account", async () => {
    const f = fakes([null, null]);
    const repo = new ConfigBackupRepo(f.db, f.bucket);
    f.objects.set("backups/8/abc", envelope);
    expect(await repo.get(7, "abc")).toBeNull();
    expect(await repo.remove(7, "abc")).toBe(false);
    expect(f.objects.has("backups/8/abc")).toBe(true);
    for (const s of f.statements) expect(s.sql).toContain("user_id = ?1");
  });

  it("clears every backup of a deleted account", async () => {
    const f = fakes([], [[{ id: "a" }, { id: "b" }]]);
    await new ConfigBackupRepo(f.db, f.bucket).removeAllForUser(7);
    expect(f.deleted).toEqual(["backups/7/a", "backups/7/b"]);
  });

  it("keeps the migration additive", () => {
    expect(migration).not.toMatch(/\b(?:DROP|ALTER|DELETE)\b/);
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS config_backups");
  });
});
