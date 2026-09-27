# Reasonix Platform instructions

- This branch owns shared online services only. Do not add product client or
  public website code here.
- Keep every production deployment manually triggered and restricted to the
  `platform` branch.
- Database changes must be backward-compatible, idempotent, and accompanied by
  a migration or runtime schema guard.
- Ingest endpoints must validate before enqueueing, acknowledge only durable
  work, and remain safe under retries.
- Add tests at the HTTP, queue, or storage boundary where behavior becomes
  externally observable.
- Never commit credentials, tokens, customer content, or personal user data.
- Comments are English and explain only non-obvious constraints.
