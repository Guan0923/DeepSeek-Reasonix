import type { Env } from "./env";

export type TelemetryKind = "ping" | "metrics";

export type TelemetryEnvelope = {
  version: 1;
  eventId: string;
  receivedAt: string;
  kind: TelemetryKind;
  payload: unknown;
};

export const TELEMETRY_RECEIPT_SCHEMA_SQL = [
  `CREATE TABLE IF NOT EXISTS telemetry_receipts (
     event_id TEXT PRIMARY KEY,
     date TEXT NOT NULL
   )`,
  `CREATE INDEX IF NOT EXISTS telemetry_receipts_date ON telemetry_receipts (date)`,
] as const;

const schemaPromises = new WeakMap<object, Promise<void>>();

export function ensureTelemetryReceiptSchema(env: Pick<Env, "DB">): Promise<void> {
  const key = env.DB as unknown as object;
  const existing = schemaPromises.get(key);
  if (existing) return existing;
  const creation = env.DB
    .batch(TELEMETRY_RECEIPT_SCHEMA_SQL.map((sql) => env.DB.prepare(sql)))
    .then(() => undefined)
    .catch((err) => {
      schemaPromises.delete(key);
      throw err;
    });
  schemaPromises.set(key, creation);
  return creation;
}

export function queueEnabled(env: Pick<Env, "TELEMETRY_QUEUE_ENABLED">): boolean {
  return env.TELEMETRY_QUEUE_ENABLED === "true";
}

export async function enqueueTelemetry(
  env: Pick<Env, "TELEMETRY_QUEUE">,
  kind: TelemetryKind,
  payload: unknown,
): Promise<void> {
  if (!env.TELEMETRY_QUEUE) throw new Error("telemetry queue binding unavailable");
  await env.TELEMETRY_QUEUE.send({
    version: 1,
    eventId: crypto.randomUUID(),
    receivedAt: new Date().toISOString(),
    kind,
    payload,
  });
}

function isEnvelope(value: unknown): value is TelemetryEnvelope {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<TelemetryEnvelope>;
  return (
    candidate.version === 1 &&
    typeof candidate.eventId === "string" &&
    /^[0-9a-f-]{36}$/.test(candidate.eventId) &&
    typeof candidate.receivedAt === "string" &&
    !Number.isNaN(Date.parse(candidate.receivedAt)) &&
    (candidate.kind === "ping" || candidate.kind === "metrics") &&
    "payload" in candidate
  );
}

function archiveKey(now: Date): string {
  const iso = now.toISOString();
  return `telemetry/${iso.slice(0, 4)}/${iso.slice(5, 7)}/${iso.slice(8, 10)}/${iso.slice(11, 13)}/${crypto.randomUUID()}.ndjson.gz`;
}

async function archiveBatch(env: Pick<Env, "TELEMETRY_RAW">, envelopes: TelemetryEnvelope[]): Promise<void> {
  if (!env.TELEMETRY_RAW) throw new Error("telemetry raw bucket binding unavailable");
  const ndjson = `${envelopes.map((envelope) => JSON.stringify(envelope)).join("\n")}\n`;
  const compressed = new Blob([ndjson]).stream().pipeThrough(new CompressionStream("gzip"));
  const body = await new Response(compressed).arrayBuffer();
  await env.TELEMETRY_RAW.put(archiveKey(new Date()), body, {
    httpMetadata: { contentType: "application/x-ndjson", contentEncoding: "gzip" },
    customMetadata: { schema: "reasonix-telemetry-v1", records: String(envelopes.length) },
  });
}

export async function consumeTelemetryBatch(
  batch: MessageBatch<TelemetryEnvelope>,
  env: Pick<Env, "TELEMETRY_RAW">,
  persist: (envelope: TelemetryEnvelope) => Promise<void>,
): Promise<void> {
  const valid: Array<{ message: Message<TelemetryEnvelope>; envelope: TelemetryEnvelope }> = [];
  for (const message of batch.messages) {
    if (!isEnvelope(message.body)) {
      console.error("telemetry queue discarded an invalid envelope");
      message.ack();
      continue;
    }
    valid.push({ message, envelope: message.body });
  }
  if (!valid.length) return;

  try {
    await archiveBatch(env, valid.map(({ envelope }) => envelope));
  } catch (err) {
    console.error("telemetry archive failed", err);
    for (const { message } of valid) message.retry();
    return;
  }

  for (const { message, envelope } of valid) {
    try {
      await persist(envelope);
      message.ack();
    } catch (err) {
      console.error("telemetry persistence failed", err);
      message.retry();
    }
  }
}
