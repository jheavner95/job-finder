# JobScore public connector

Job Finder supports JobScore through the vendor's documented, employer-scoped
JSON Job Feed API:

```text
https://careers.jobscore.com/jobs/{account}/feed.json
```

The connector does not use career-page internals or undocumented endpoints.

## Discovery and validation

Before downloading a feed, discovery checks
`https://careers.jobscore.com/robots.txt` for the exact employer feed path. A
denial, unavailable policy, malformed response, network error, or timeout fails
closed and produces a deterministic connector diagnostic. Robots decisions are
cached for the discovery batch.

The JSON parser requires a root company and jobs collection. Each published job
must contain a unique position ID, title, description, valid detail URL, and
valid optional application URL and source dates. Malformed JSON, duplicate or
missing IDs, invalid URLs, unexpected collection shapes, and missing required
fields stop that feed without importing partial results.

An empty jobs collection is valid and represents an employer with no currently
published positions. A previously discovered ID that disappears is treated as
no longer public.

## Canonical normalization

The connector preserves only fields supplied by JobScore:

- company binding from the reviewed connector
- position ID
- title
- department
- location
- description
- employment type when exposed by a matching custom field
- canonical detail URL
- application URL
- opened date
- source-updated date

It does not infer salary, remote status, metadata, or a posting date when the
opened date is absent.

Duplicate prevention uses `(provider, company, sourceJobId)` as the primary
identity, canonical detail URL as the secondary identity, and the shared
fingerprint as the tertiary defense.

## Polling and recovery

New JobScore connectors default to daily polling at 8:00 AM. Both scheduled and
manual discovery enforce the vendor's one-hour minimum interval per employer.
The feed client honors `Retry-After` for throttled or temporarily unavailable
responses and otherwise retries transient network, timeout, 429, 502, 503, and
504 failures with bounded exponential backoff and jitter.

The connector never retries schema errors or other permanent response failures.

Errors persist the shared stable diagnostic code, provider-safe message, and
context. Successful complete feeds reconcile missing IDs into `closedAt` with
an auditable reason; network, authentication, robots, partial, and malformed
feeds never close jobs.

## Vendor reference

- [JobScore Developers Guide to Job Feed APIs](https://support.jobscore.com/hc/en-us/articles/202001320-Developers-Guide-to-Job-Feed-APIs)
