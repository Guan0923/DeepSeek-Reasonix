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
