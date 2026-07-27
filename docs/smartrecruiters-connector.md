# SmartRecruiters connector contract

- **Endpoint:** documented Posting API under `api.smartrecruiters.com/v1/companies/{company}/postings`.
- **Identity:** posting ID, canonical public job URL, then shared fingerprint.
- **Normalization:** title, full location, employment type, job-ad sections, and compensation when present.
- **Deletion:** complete-feed absence or a detail 404 closes the posting.
- **Requests:** shared timeout, Retry-After, bounded retry, backoff, and jitter.
- **Robots:** exact company postings path.
- **Diagnostics:** standard typed errors, complete-feed IDs, totals, and exclusions.
- **Scheduling:** manual by default with shared rate controls.
- **Limitations:** the current collection request is capped at its configured public page size; pagination capability is declared for follow-up expansion.
