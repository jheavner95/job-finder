# Greenhouse connector contract

- **Endpoint:** documented Job Board API under `boards-api.greenhouse.io/v1/boards/{board}`.
- **Identity:** Greenhouse job ID, canonical `absolute_url`, then shared fingerprint.
- **Normalization:** title, location, description, employment metadata, and compensation metadata when explicitly present.
- **Deletion:** a successful complete board feed closes previously seen IDs that disappear; a detail 404 is an explicit deletion.
- **Requests:** shared 15-second timeout, Retry-After support, three bounded attempts, exponential backoff, and jitter.
- **Robots:** exact `/v1/boards/{board}/jobs` path, cached per board and failed closed.
- **Diagnostics:** typed error code, provider-safe message, context, feed totals, and exclusions.
- **Scheduling:** manual by default; connector and robots rate budgets apply.
- **Limitations:** posting date, structured remote state, and department are not guaranteed by the public response.
