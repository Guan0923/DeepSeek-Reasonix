#!/usr/bin/env node

import { randomBytes } from "node:crypto";

const RESULT_HEADER = "x-reasonix-telemetry-result";
const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);

function usage() {
  return `Reasonix telemetry capacity probe

Usage:
  npm run capacity:telemetry -- [options]

Options:
  --target URL             Worker origin (default: http://127.0.0.1:8787)
  --requests N             Total requests (default: 1000)
  --concurrency N          In-flight requests (default: 50)
  --endpoint ping|metrics|mixed (default: mixed)
  --surface desktop|cli|studio (default: studio)
  --max-p95-ms N           Failure threshold (default: 500)
  --min-durable-rate N     queued/stored ratio threshold (default: 0.99)
  --allow-remote           Required for every non-loopback target
  --allow-production       Also required for *.reasonix.io
  --help
`;
}

function positiveInt(value, name) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) throw new Error(`${name} must be a positive integer`);
  return parsed;
}

function ratio(value, name) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) throw new Error(`${name} must be between 0 and 1`);
  return parsed;
}

export function parseArgs(argv) {
  const options = {
    target: "http://127.0.0.1:8787",
    requests: 1000,
    concurrency: 50,
    endpoint: "mixed",
    surface: "studio",
    maxP95Ms: 500,
    minDurableRate: 0.99,
    allowRemote: false,
    allowProduction: false,
    help: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const next = () => {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) throw new Error(`${argument} requires a value`);
      index += 1;
      return value;
    };
    if (argument === "--target") options.target = next();
    else if (argument === "--requests") options.requests = positiveInt(next(), argument);
    else if (argument === "--concurrency") options.concurrency = positiveInt(next(), argument);
    else if (argument === "--endpoint") options.endpoint = next();
    else if (argument === "--surface") options.surface = next();
    else if (argument === "--max-p95-ms") options.maxP95Ms = positiveInt(next(), argument);
    else if (argument === "--min-durable-rate") options.minDurableRate = ratio(next(), argument);
    else if (argument === "--allow-remote") options.allowRemote = true;
    else if (argument === "--allow-production") options.allowProduction = true;
    else if (argument === "--help") options.help = true;
    else throw new Error(`unknown option: ${argument}`);
  }
  if (!["ping", "metrics", "mixed"].includes(options.endpoint)) throw new Error("--endpoint must be ping, metrics, or mixed");
  if (!["desktop", "cli", "studio"].includes(options.surface)) throw new Error("--surface must be desktop, cli, or studio");
  return options;
}

export function assertSafeTarget(options) {
  const target = new URL(options.target);
  if (!["http:", "https:"].includes(target.protocol)) throw new Error("target must use http or https");
  const local = LOCAL_HOSTS.has(target.hostname);
  if (!local && !options.allowRemote) throw new Error("remote target refused; pass --allow-remote after confirming the environment");
  const production = target.hostname === "reasonix.io" || target.hostname.endsWith(".reasonix.io");
  if (production && !options.allowProduction) {
    throw new Error("production target refused; a reviewed run also requires --allow-production");
  }
  return target;
}

export function percentile(values, quantile) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * quantile) - 1)];
}

function payload(index, surface, endpoint) {
  if (endpoint === "metrics") {
    return {
      surface,
      version: "capacity-test",
      os: "linux",
      counters: [{ signal: "client_surface", bucket: surface, count: 1 }],
    };
  }
  return {
    surface,
    installId: randomBytes(16).toString("hex"),
    version: "capacity-test",
    os: "linux",
    arch: "x64",
    channel: `capacity-${index % 10}`,
  };
}

export async function run(options) {
  const target = assertSafeTarget(options);
  const durations = [];
  const statuses = {};
  const results = {};
  let cursor = 0;
  const startedAt = performance.now();

  async function worker() {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= options.requests) return;
      const endpoint = options.endpoint === "mixed" ? (index % 2 === 0 ? "ping" : "metrics") : options.endpoint;
      const requestStartedAt = performance.now();
      try {
        const response = await fetch(new URL(`/v1/${endpoint}`, target), {
          method: "POST",
          headers: { "content-type": "application/json", "user-agent": "reasonix-capacity-probe/1" },
          body: JSON.stringify(payload(index, options.surface, endpoint)),
        });
        durations.push(performance.now() - requestStartedAt);
        statuses[response.status] = (statuses[response.status] ?? 0) + 1;
        const result = response.headers.get(RESULT_HEADER) ?? "missing";
        results[result] = (results[result] ?? 0) + 1;
        await response.arrayBuffer();
      } catch (error) {
        durations.push(performance.now() - requestStartedAt);
        results.network_error = (results.network_error ?? 0) + 1;
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(options.concurrency, options.requests) }, () => worker()));
  const elapsedMs = performance.now() - startedAt;
  const durable = (results.queued ?? 0) + (results.stored ?? 0);
  const durableRate = durable / options.requests;
  const summary = {
    target: target.origin,
    requests: options.requests,
    concurrency: options.concurrency,
    elapsedMs: Math.round(elapsedMs),
    requestsPerSecond: Number((options.requests / (elapsedMs / 1000)).toFixed(1)),
    latencyMs: {
      p50: Math.round(percentile(durations, 0.5)),
      p95: Math.round(percentile(durations, 0.95)),
      p99: Math.round(percentile(durations, 0.99)),
      max: Math.round(Math.max(...durations)),
    },
    statuses,
    telemetryResults: results,
    durableRate: Number(durableRate.toFixed(5)),
    passed: durableRate >= options.minDurableRate && percentile(durations, 0.95) <= options.maxP95Ms,
  };
  return summary;
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    if (options.help) {
      process.stdout.write(usage());
      return;
    }
    const summary = await run(options);
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
    if (!summary.passed) process.exitCode = 1;
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n\n${usage()}`);
    process.exitCode = 2;
  }
}

if (import.meta.url === new URL(process.argv[1], "file:").href) await main();
