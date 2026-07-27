# Lever connector contract

- **Endpoint:** documented public Postings API at `api[.eu].lever.co/v0/postings/{site}`.
- **Identity:** Lever posting ID, hosted URL, then shared fingerprint.
- **Normalization:** title, location, description sections, commitment, and salary range when present.
- **Deletion:** complete-feed absence or a detail 404 closes the posting.
- **Requests:** shared timeout, Retry-After, bounded retry, backoff, and jitter; EU boards retain the EU API host.
- **Robots:** exact employer postings path on the matching regional API host.
- **Diagnostics:** standard typed errors, complete-feed IDs, totals, and exclusions.
- **Scheduling:** manual by default with shared rate controls.
- **Limitations:** department and provider dates are not currently normalized.
