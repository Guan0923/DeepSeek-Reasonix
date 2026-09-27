# Reasonix Platform

This branch contains only the shared Reasonix service platform:

- identity and account services;
- community and forum services;
- crash, diagnostics, telemetry, and registry services;
- Cloudflare Worker, D1, Queue, and R2 configuration;
- production deployment workflows for those services.

Product clients live on `main-v2` and `studio`. The public website lives on
`website`. Production deployments are accepted only from this branch.

## Services

| Directory | Responsibility |
| --- | --- |
| `workers/accounts` | Shared identity, sessions, device grants, and email login |
| `workers/forum` | Community forum APIs |
| `workers/crash-report` | Diagnostics, telemetry, registry, and admin dashboards |

Each service owns its package manager lockfile, tests, schema, migrations, and
Wrangler configuration. Run validation from the service directory before using
the matching manual production deployment workflow.
