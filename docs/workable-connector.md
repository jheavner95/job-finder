# Workable connector contract

- **Endpoint:** documented public account endpoint at `workable.com/api/accounts/{account}?details=true`.
- **Identity:** shortcode or provider ID, canonical job URL, then shared fingerprint.
- **Normalization:** title, location, workplace signals, employment type, description, and salary when present.
- **Deletion:** collection refetch and successful complete-feed reconciliation detect removal.
- **Requests:** shared timeout, Retry-After, bounded retry, backoff, and jitter.
- **Robots:** exact public account path.
- **Diagnostics:** standard typed errors, complete-feed IDs, totals, and exclusions.
- **Scheduling:** manual by default with shared rate controls.
- **Limitations:** remote state is represented through explicit workplace/location text before canonical normalization.
