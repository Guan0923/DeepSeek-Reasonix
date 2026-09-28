import { afterEach, describe, expect, it, vi } from "vitest";
// @ts-expect-error Node types are intentionally not part of the Worker build.
import { DatabaseSync } from "node:sqlite";
import registryApp from "../app";
import type { Bindings } from "../env";
import registrySchema from "../../../registry-schema.sql?raw";

const now = "2026-09-27T00:00:00.000Z";

function sqliteD1() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(registrySchema);
  const insert = sqlite.prepare(
    `INSERT INTO packages (kind, scope_handle, name, slug, source, install_kind, latest_version, status, publisher_id, created_at, updated_at)
     VALUES (?1, ?2, ?3, ?2 || '/' || ?3, 'https://github.com/o/r', ?4, '0.1.0', ?5, ?6, ?7, ?7)`,
  );
  insert.run("theme", "alice", "dusk", "plugin", "pending", 7, "2026-09-26T00:00:00.000Z");
  insert.run("skill", "alice", "review", "skill", "active", 7, "2026-09-25T00:00:00.000Z");
  insert.run("plugin", "alice", "kit", "plugin", "rejected", 7, "2026-09-24T00:00:00.000Z");
  insert.run("mcp", "bob", "other", "mcp", "pending", 8, now);
  const db = {
    prepare(sql: string) {
      const statement = sqlite.prepare(sql);
      const wrapper: any = {
        values: [] as unknown[],
        bind(...values: unknown[]) {
          wrapper.values = values;
          return wrapper;
        },
        async first() {
          return statement.get(...wrapper.values) ?? null;
        },
        async all() {
          return { results: statement.all(...wrapper.values) };
        },
      };
      return wrapper;
    },
  } as unknown as D1Database;
  return { db, close: () => sqlite.close() };
}

function bindings(db: D1Database): Bindings {
  return {
    DB: db,
    ACCOUNTS_ORIGIN: "https://id.reasonix.test",
    APP_ORIGIN: "https://reasonix.test",
    ALLOWED_ORIGINS: "https://reasonix.test",
  };
}

afterEach(() => vi.unstubAllGlobals());

describe("GET /v1/me/packages", () => {
  it("lists the caller's own submissions in every review state", async () => {
    const accounts = vi.fn(async (_url: string, _init?: RequestInit) =>
      Response.json({ user: { id: 7, handle: "alice", role: "member", emailVerified: true } }),
    );
    vi.stubGlobal("fetch", accounts);
    const { db, close } = sqliteD1();
    try {
      const response = await registryApp.fetch(
        new Request("https://crash.reasonix.test/v1/me/packages", { headers: { authorization: "Bearer tok" } }),
        bindings(db),
      );
      expect(response.status).toBe(200);
      const body = (await response.json()) as { packages: { slug: string; status: string; kind: string; installKind: string }[] };
      expect(body.packages.map((p) => [p.slug, p.status])).toEqual([
        ["alice/dusk", "pending"],
        ["alice/review", "active"],
        ["alice/kit", "rejected"],
      ]);
      expect(body.packages[0]).toMatchObject({ kind: "theme", installKind: "plugin" });
      expect(accounts.mock.calls[0][0]).toBe("https://id.reasonix.test/me");
      expect((accounts.mock.calls[0][1]?.headers as Record<string, string>).authorization).toBe("Bearer tok");
    } finally {
      close();
    }
  });

  it("names an identity outage as its own, never as signed out, and refuses redirects", async () => {
    const accounts = vi.fn(async () => new Response("down", { status: 502 }));
    vi.stubGlobal("fetch", accounts);
    const { db, close } = sqliteD1();
    try {
      const response = await registryApp.fetch(
        new Request("https://crash.reasonix.test/v1/me/packages", { headers: { authorization: "Bearer tok" } }),
        bindings(db),
      );
      expect(response.status).toBe(503);
      expect(((await response.json()) as { error: { code: string } }).error.code).toBe("accounts_unavailable");
      expect((accounts.mock.calls[0] as unknown[])[1]).toMatchObject({ redirect: "manual" });
    } finally {
      close();
    }
  });

  it("answers 401 without an identity", async () => {
    const accounts = vi.fn();
    vi.stubGlobal("fetch", accounts);
    const { db, close } = sqliteD1();
    try {
      const response = await registryApp.fetch(new Request("https://crash.reasonix.test/v1/me/packages"), bindings(db));
      expect(response.status).toBe(401);
      expect(accounts).not.toHaveBeenCalled();
    } finally {
      close();
    }
  });
});
