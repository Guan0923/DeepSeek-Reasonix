-- Apply: wrangler d1 execute reasonix-telemetry --remote --file=telemetry-schema.sql
-- CLI and Studio telemetry only. Desktop telemetry remains in reasonix-crash
-- while diagnostics attribution still depends on those tables.
CREATE TABLE IF NOT EXISTS pings (
  date TEXT NOT NULL,
  install_id TEXT NOT NULL,
  version TEXT NOT NULL,
  os TEXT NOT NULL,
  arch TEXT NOT NULL,
  os_version TEXT NOT NULL DEFAULT '',
  os_build INTEGER NOT NULL DEFAULT 0,
  os_revision INTEGER NOT NULL DEFAULT 0,
  channel TEXT NOT NULL DEFAULT '',
  distro_id TEXT NOT NULL DEFAULT '',
  distro_version TEXT NOT NULL DEFAULT '',
  kernel_version TEXT NOT NULL DEFAULT '',
  session_type TEXT NOT NULL DEFAULT '',
  runtime_engine TEXT NOT NULL DEFAULT '',
  runtime_version TEXT NOT NULL DEFAULT '',
  gpu_mode TEXT NOT NULL DEFAULT '',
  opens INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (date, install_id)
);

CREATE TABLE IF NOT EXISTS metrics (
  date TEXT NOT NULL,
  version TEXT NOT NULL,
  os TEXT NOT NULL,
  signal TEXT NOT NULL,
  bucket TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (date, version, os, signal, bucket)
);

CREATE TABLE IF NOT EXISTS cli_pings (
  date TEXT NOT NULL,
  install_id TEXT NOT NULL,
  version TEXT NOT NULL,
  os TEXT NOT NULL,
  arch TEXT NOT NULL,
  os_version TEXT NOT NULL DEFAULT '',
  os_build INTEGER NOT NULL DEFAULT 0,
  os_revision INTEGER NOT NULL DEFAULT 0,
  channel TEXT NOT NULL DEFAULT '',
  distro_id TEXT NOT NULL DEFAULT '',
  distro_version TEXT NOT NULL DEFAULT '',
  kernel_version TEXT NOT NULL DEFAULT '',
  session_type TEXT NOT NULL DEFAULT '',
  runtime_engine TEXT NOT NULL DEFAULT '',
  runtime_version TEXT NOT NULL DEFAULT '',
  gpu_mode TEXT NOT NULL DEFAULT '',
  opens INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (date, install_id)
);

CREATE TABLE IF NOT EXISTS cli_metrics (
  date TEXT NOT NULL,
  version TEXT NOT NULL,
  os TEXT NOT NULL,
  signal TEXT NOT NULL,
  bucket TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (date, version, os, signal, bucket)
);

CREATE TABLE IF NOT EXISTS studio_pings (
  date TEXT NOT NULL,
  install_id TEXT NOT NULL,
  version TEXT NOT NULL,
  os TEXT NOT NULL,
  arch TEXT NOT NULL,
  os_version TEXT NOT NULL DEFAULT '',
  os_build INTEGER NOT NULL DEFAULT 0,
  os_revision INTEGER NOT NULL DEFAULT 0,
  channel TEXT NOT NULL DEFAULT '',
  distro_id TEXT NOT NULL DEFAULT '',
  distro_version TEXT NOT NULL DEFAULT '',
  kernel_version TEXT NOT NULL DEFAULT '',
  session_type TEXT NOT NULL DEFAULT '',
  runtime_engine TEXT NOT NULL DEFAULT '',
  runtime_version TEXT NOT NULL DEFAULT '',
  gpu_mode TEXT NOT NULL DEFAULT '',
  opens INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (date, install_id)
);

CREATE TABLE IF NOT EXISTS studio_metrics (
  date TEXT NOT NULL,
  version TEXT NOT NULL,
  os TEXT NOT NULL,
  signal TEXT NOT NULL,
  bucket TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (date, version, os, signal, bucket)
);

CREATE TABLE IF NOT EXISTS telemetry_receipts (
  event_id TEXT PRIMARY KEY,
  date TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS telemetry_receipts_date ON telemetry_receipts (date);
