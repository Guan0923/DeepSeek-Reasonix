-- Encrypted configuration backups. The envelope lives in R2 under
-- backups/<user_id>/<id>; this table holds only what a listing shows.

CREATE TABLE IF NOT EXISTS config_backups (
  id                TEXT    PRIMARY KEY,
  user_id           INTEGER NOT NULL,
  label             TEXT    NOT NULL,
  format            INTEGER NOT NULL,
  app_version       TEXT    NOT NULL,
  platform          TEXT    NOT NULL,
  categories        TEXT    NOT NULL,
  ciphertext_bytes  INTEGER NOT NULL,
  ciphertext_sha256 TEXT    NOT NULL,
  created_at        TEXT    NOT NULL
);
CREATE INDEX IF NOT EXISTS config_backups_user
  ON config_backups (user_id, created_at);
