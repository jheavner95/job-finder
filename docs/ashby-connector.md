# Ashby connector contract

- **Endpoint:** documented public job-board endpoint at `api.ashbyhq.com/posting-api/job-board/{board}`.
- **Identity:** Ashby posting ID, `jobUrl`, then shared fingerprint.
- **Normalization:** title, locations, workplace type, description, employment type, and documented compensation.
- **Deletion:** collection refetch detects explicit removal; complete-feed absence also closes jobs.
- **Requests:** shared timeout, Retry-After, bounded retry, backoff, and jitter.
- **Robots:** exact job-board path on `api.ashbyhq.com`.
- **Diagnostics:** standard typed errors, complete-feed IDs, totals, and exclusions.
- **Scheduling:** manual by default with shared rate controls.
- **Limitations:** application URL and provider dates are not yet preserved separately.
