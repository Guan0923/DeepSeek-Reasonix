import { describe, expect, it, vi } from "vitest";
import {
  consumeTelemetryBatch,
  enqueueTelemetry,
  ensureTelemetryReceiptSchema,
  TELEMETRY_RECEIPT_SCHEMA_SQL,
  type TelemetryEnvelope,
} from "./telemetry_queue";

function queuedMessage(body: unknown) {
  return {
    body,
    ack: vi.fn(),
    retry: vi.fn(),
  } as unknown as Message<TelemetryEnvelope>;
}

function batch(messages: Message<TelemetryEnvelope>[]) {
  return { messages } as unknown as MessageBatch<TelemetryEnvelope>;
}

const envelope = (kind: "ping" | "metrics" = "ping"): TelemetryEnvelope => ({
  version: 1,
  eventId: crypto.randomUUID(),
  receivedAt: "2026-09-27T04:00:00.000Z",
  kind,
  payload: { value: 1 },
});

describe("telemetry queue", () => {
  it("enqueues a versioned envelope", async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    await enqueueTelemetry({ TELEMETRY_QUEUE: { send } as unknown as Queue<TelemetryEnvelope> }, "metrics", {
      counters: [],
    });

    expect(send).toHaveBeenCalledOnce();
    expect(send.mock.calls[0][0]).toMatchObject({ version: 1, kind: "metrics", payload: { counters: [] } });
    expect(send.mock.calls[0][0].eventId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("archives before acknowledging persisted messages", async () => {
    const put = vi.fn().mockResolvedValue(undefined);
    const persist = vi.fn().mockResolvedValue(undefined);
    const message = queuedMessage(envelope());

    await consumeTelemetryBatch(batch([message]), { TELEMETRY_RAW: { put } as unknown as R2Bucket }, persist);

    expect(put).toHaveBeenCalledOnce();
    expect(persist).toHaveBeenCalledOnce();
    expect(message.ack).toHaveBeenCalledOnce();
    expect(message.retry).not.toHaveBeenCalled();
  });

  it("retries without persisting when the archive is unavailable", async () => {
    const put = vi.fn().mockRejectedValue(new Error("unavailable"));
    const persist = vi.fn();
    const message = queuedMessage(envelope());

    await consumeTelemetryBatch(batch([message]), { TELEMETRY_RAW: { put } as unknown as R2Bucket }, persist);

    expect(persist).not.toHaveBeenCalled();
    expect(message.retry).toHaveBeenCalledOnce();
    expect(message.ack).not.toHaveBeenCalled();
  });

  it("acknowledges invalid envelopes so poison messages do not cycle", async () => {
    const put = vi.fn();
    const persist = vi.fn();
    const message = queuedMessage({ version: 99 });

    await consumeTelemetryBatch(batch([message]), { TELEMETRY_RAW: { put } as unknown as R2Bucket }, persist);

    expect(message.ack).toHaveBeenCalledOnce();
    expect(message.retry).not.toHaveBeenCalled();
    expect(put).not.toHaveBeenCalled();
    expect(persist).not.toHaveBeenCalled();
  });

  it("initializes the idempotency schema once per database binding", async () => {
    const prepared: string[] = [];
    const db = {
      prepare(sql: string) {
        prepared.push(sql);
        return { sql };
      },
      batch: vi.fn().mockResolvedValue([]),
    } as unknown as D1Database;

    await ensureTelemetryReceiptSchema({ DB: db });
    await ensureTelemetryReceiptSchema({ DB: db });

    expect(prepared).toEqual([...TELEMETRY_RECEIPT_SCHEMA_SQL]);
    expect(db.batch).toHaveBeenCalledOnce();
  });
});
