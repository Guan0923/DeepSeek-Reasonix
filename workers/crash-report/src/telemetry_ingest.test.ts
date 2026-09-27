import { describe, expect, it, vi } from "vitest";
import worker from "./index";
import type { Env, RateLimiter } from "./env";

function limiter(success = true): RateLimiter {
  return { limit: vi.fn().mockResolvedValue({ success }) };
}

function env(overrides: Partial<Env> = {}): Env {
  return {
    PING_LIMITER: limiter(),
    METRICS_LIMITER: limiter(),
    TELEMETRY_BUDGET_LIMITER: limiter(),
    TELEMETRY_QUEUE_ENABLED: "true",
    TELEMETRY_QUEUE: { send: vi.fn().mockResolvedValue(undefined) } as unknown as Env["TELEMETRY_QUEUE"],
    ...overrides,
  } as Env;
}

function post(path: string, body: unknown): Request {
  const json = JSON.stringify(body);
  return new Request(`https://crash.reasonix.io${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "content-length": String(new TextEncoder().encode(json).byteLength),
      "cf-connecting-ip": "203.0.113.10",
    },
    body: json,
  });
}

describe("telemetry admission result", () => {
  it("marks a durably enqueued ping", async () => {
    const bindings = env();
    const response = await worker.fetch(post("/v1/ping", {
      installId: "a".repeat(32),
      version: "capacity-test",
      os: "linux",
      arch: "x64",
      surface: "studio",
    }), bindings);

    expect(response.status).toBe(202);
    expect(response.headers.get("x-reasonix-telemetry-result")).toBe("queued");
    expect(bindings.TELEMETRY_QUEUE?.send).toHaveBeenCalledOnce();
  });

  it("makes global budget sampling observable without enqueueing", async () => {
    const bindings = env({ TELEMETRY_BUDGET_LIMITER: limiter(false) });
    const response = await worker.fetch(post("/v1/ping", {
      installId: "b".repeat(32),
      version: "capacity-test",
      os: "linux",
      arch: "x64",
      surface: "studio",
    }), bindings);

    expect(response.status).toBe(202);
    expect(response.headers.get("x-reasonix-telemetry-result")).toBe("sampled");
    expect(bindings.TELEMETRY_QUEUE?.send).not.toHaveBeenCalled();
  });

  it("marks an empty compatible metrics batch as ignored", async () => {
    const bindings = env();
    const response = await worker.fetch(post("/v1/metrics", {
      version: "capacity-test",
      os: "linux",
      surface: "studio",
      counters: [{ signal: "future_signal", bucket: "future", count: 1 }],
    }), bindings);

    expect(response.status).toBe(202);
    expect(response.headers.get("x-reasonix-telemetry-result")).toBe("ignored");
    expect(bindings.TELEMETRY_QUEUE?.send).not.toHaveBeenCalled();
  });
});

describe("telemetry queue database batching", () => {
  it("persists an entire queue delivery in one D1 data batch", async () => {
    const dataBatches: unknown[][] = [];
    const db = {
      prepare(sql: string) {
        return {
          sql,
          bind(...bindings: unknown[]) {
            return { sql, bindings };
          },
        };
      },
      async batch(statements: unknown[]) {
        dataBatches.push(statements);
        return [];
      },
    } as unknown as D1Database;
    const queued = [
      {
        version: 1 as const,
        eventId: crypto.randomUUID(),
        receivedAt: "2026-09-27T06:00:00.000Z",
        kind: "ping" as const,
        payload: {
          installId: "c".repeat(32), version: "capacity-test", os: "linux", arch: "x64", surface: "desktop",
        },
      },
      {
        version: 1 as const,
        eventId: crypto.randomUUID(),
        receivedAt: "2026-09-27T06:00:00.000Z",
        kind: "metrics" as const,
        payload: {
          version: "capacity-test",
          os: "linux",
          surface: "desktop",
          counters: [
            { signal: "client_surface", bucket: "desktop", count: 1 },
            { signal: "client_version", bucket: "capacity_test", count: 1 },
          ],
        },
      },
    ];
    const messages = queued.map((body) => ({ body, ack: vi.fn(), retry: vi.fn() }));
    const bindings = {
      DB: db,
      TELEMETRY_RAW: { put: vi.fn().mockResolvedValue(undefined) },
    } as unknown as Env;

    await worker.queue({ messages } as unknown as MessageBatch<(typeof queued)[number]>, bindings);

    expect(dataBatches).toHaveLength(2);
    expect(dataBatches[0]).toHaveLength(2); // idempotency schema guard
    expect(dataBatches[1]).toHaveLength(4); // two statements per envelope
    expect(JSON.stringify(dataBatches[1])).toContain("json_each");
    for (const message of messages) {
      expect(message.ack).toHaveBeenCalledOnce();
      expect(message.retry).not.toHaveBeenCalled();
    }
  });
});
