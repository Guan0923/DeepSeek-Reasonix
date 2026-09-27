# Reasonix platform capacity contract

This document defines what “ready for 10,000 concurrent users” means. It is an
acceptance contract, not a claim that the current production system has already
passed the target.

## Budget and design constraints

- Keep recurring infrastructure within CNY 200/month at the current traffic
  level. Prefer Cloudflare managed primitives over idle servers.
- Never make synchronous telemetry storage part of a product launch path.
- Validate at the edge, durably enqueue, then persist asynchronously.
- A successful HTTP response must expose whether the event was `queued`,
  `stored`, `sampled`, or `ignored` through
  `x-reasonix-telemetry-result`. HTTP 202 alone is not proof of durable intake.
- Production load tests require owner approval. The repository probe refuses
  remote and production targets unless they are unlocked separately.

## Service-level objectives

| Path | Workload | Pass condition |
| --- | --- | --- |
| Telemetry admission | 10,000 distributed requests over 60 seconds | >=99.9% `queued`, p95 <=500 ms, no 5xx |
| Telemetry drain | 10,000 queued events, batches up to 100 | backlog returns to zero within 15 minutes, no DLQ growth |
| Identity session read | 1,000 requests/second for 5 minutes | >=99.9% success, p95 <=300 ms |
| Registry public read | 1,000 requests/second for 5 minutes | >=99.9% success, p95 <=300 ms |
| Admin dashboards | 20 concurrent viewers for 10 minutes | >=99% success, p95 <=2 seconds |

“Distributed” matters because per-IP abuse protection intentionally rejects a
single machine long before the platform capacity limit. A staging environment
must mirror production bindings and use isolated databases, queues, and R2.

## Required evidence before calling the platform stable

1. A saved probe report with request count, latency percentiles, HTTP statuses,
   durable/sample ratios, queue backlog peak, drain time, D1 query latency, and
   DLQ delta.
2. A rollback or traffic-shed procedure exercised in staging.
3. Alerts for sustained 5xx, queue backlog age, DLQ growth, D1 overload, and
   database size thresholds.
4. Seven consecutive days without unexplained ingestion gaps after a production
   rollout.

## Current known gaps

- CLI and Studio telemetry use an isolated D1 write plane. Legacy desktop
  telemetry still shares the crash database because diagnostics attribution
  depends on it; that remaining dependency is the next database split.
- The global telemetry budget is currently 1,000 events/minute. It protects the
  database but cannot satisfy the 10,000/minute durable-intake target.
- Queue consumption is deliberately serialized for D1. A delivery is persisted
  as one atomic D1 batch with two statements per valid envelope (at most 200
  statements for the configured 100-message queue batch). Drain throughput must
  be measured before raising the global intake budget.
- Read replication and the Sessions API have not yet been enabled for eligible
  read-heavy paths.

## Local probe

Run the Worker locally, then run:

```sh
npm run capacity:telemetry -- --requests 1000 --concurrency 50
```

This probe fails when the p95 target or durable-intake ratio is missed. A local
run validates the admission contract and tool; it is not evidence for global
capacity. Remote runs need `--allow-remote`, and `*.reasonix.io` additionally
needs `--allow-production` after an approved test window.
