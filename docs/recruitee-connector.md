# Recruitee connector contract

- **Endpoint:** documented unauthenticated Careers Site API at `{company}.recruitee.com/api/offers/`.
- **Identity:** offer slug or ID, careers URL, then shared fingerprint.
- **Normalization:** title, description and requirements, locations, remote flag, and employment type.
- **Deletion:** successful complete-feed absence or detail 404 closes the offer.
- **Requests:** shared timeout, Retry-After, bounded retry, backoff, and jitter.
- **Robots:** exact tenant host and `/api/offers/` path.
- **Diagnostics:** standard typed errors, complete-feed IDs, totals, and exclusions.
- **Scheduling:** manual by default with shared rate controls.
- **Limitations:** salary, provider dates, and department remain null when absent.
