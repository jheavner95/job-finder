# Personio public connector

Job Finder supports Personio's documented employer-scoped public XML feed:

```text
https://{account}.jobs.personio.de/xml?language={locale}
```

Supported locales are `de`, `en`, `fr`, `es`, `nl`, `it`, and `pt`. The
connector uses the `language` query parameter from the configured career URL.
When no locale is configured it deterministically uses `en`. It never downloads
and merges multiple locales.

## Certified data

The adapter reads only fields documented by Personio: position ID, subcompany,
office, department, recruiting category, title, description blocks, employment
type, schedule, seniority, years of experience, keywords, occupation, and
occupation category. The raw parsed position remains in the canonical provider
payload. The existing Job model receives only title, configured company,
description, office, employment type/schedule, canonical URL, and provider
position ID.

Salary, remote status, posting date, and company metadata are not inferred.
Missing optional fields are accepted. Missing IDs/titles, duplicate IDs,
malformed XML, an unexpected root schema, invalid locales, timeouts, and
withdrawn positions fail with deterministic messages.

## Identity and canonical URLs

Primary identity is `(Personio source, configured company, position ID)`.
The database enforces this using the existing `Job.sourceJobId`. The canonical
detail URL is the format documented by Personio:

```text
https://{account}.jobs.personio.de/job/{positionId}
```

Canonical URL and the existing deterministic fingerprint are secondary
duplicate defenses.

## Robots and crawl behavior

Before a connector runs, Job Finder checks the exact tenant host's
`robots.txt` against `/xml`. Decisions are cached for the discovery batch.
Denial and unverified robots responses fail closed. Crawl delay and configured
rate limits continue through the shared provider runner.

## Requests, diagnostics, scheduling, and deletion

Personio uses the shared 15-second timeout, Retry-After, bounded retry,
exponential backoff, and jitter policy. Errors persist a stable code,
provider-safe message, and diagnostic context. Scheduling is manual by default.
A successful complete locale feed closes previously seen IDs that disappear;
failed, malformed, authentication-blocked, or robots-blocked feeds never close
jobs.

Reference:

- [Personio: Retrieving open positions](https://developer.personio.de/docs/retrieving-open-job-positions)
- [Personio: Integration via code](https://developer.personio.de/docs/integration-of-open-positions)
