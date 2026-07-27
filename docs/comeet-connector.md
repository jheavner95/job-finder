# Comeet connector contract

- **Endpoint:** documented Careers API under `comeet.co/careers-api/2.0/company/{uid}/positions`.
- **Identity:** position UID, hosted position URL, then shared fingerprint.
- **Normalization:** title, hosted URL, location, employment type, description/requirements, and explicit compensation details.
- **Deletion:** successful complete-feed absence or explicit detail deletion closes the position.
- **Requests:** shared timeout, Retry-After, bounded retry, backoff, and jitter.
- **Robots:** exact company UID positions path; the public token is never included in diagnostics.
- **Diagnostics:** standard typed errors and sanitized context, complete-feed IDs, totals, and exclusions.
- **Scheduling:** manual by default with shared rate controls.
- **Limitations:** use requires the employer-exposed public UID/token pair; no private credential is inferred.
