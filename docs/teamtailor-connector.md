# Teamtailor authorized connector contract

## Authorization

Teamtailor is enabled only when an employer explicitly supplies a Teamtailor
API key with at least Public read permission. Authentication uses the documented
header:

```text
Authorization: Token token={apiKey}
X-Api-Version: 20240404
```

Keys are validated before storage and saved only as a generic password in the
current user's macOS Keychain. SQLite stores only non-secret status, validation
time, and EU/NA region. Replacement is written only after the new key validates.
Removal deletes the Keychain item and disables the connector. No browser
session, cookie, OAuth token, or observed frontend request is used.

## Supported endpoints

- EU: `https://api.teamtailor.com/v1/jobs`
- North America: `https://api.na.teamtailor.com/v1/jobs`
- Job detail: `/v1/jobs/{id}`

Only published public-feed jobs are requested. Department and locations use the
documented JSON:API `include` relationship.

## Capabilities and request policy

- authentication type: employer-issued API key
- pagination: JSON:API `links.next`, page size 30
- Retry-After: supported
- timeout, retry count, exponential backoff, and jitter: shared platform policy
- default schedule: daily after successful authorization
- robots: exact `/v1/jobs` path on the configured EU or NA API host
- deletion: supported only after a successful complete paginated feed

Credential validation happens before robots validation. Authentication,
network, timeout, schema, pagination, or robots failures never reconcile
deletions.

## Identity and normalization

Primary identity is `(Teamtailor source, configured company, job ID)`.
The public career-site job URL is secondary and the shared fingerprint is
tertiary.

The connector preserves documented title, pitch/body, public job URL,
application URL, included department and locations, explicit remote status,
employment type, created date, and updated date. Missing fields remain null.
Salary and arbitrary provider metadata are not inferred.

## Diagnostics

The connector uses the shared typed error model, including `AUTH_REQUIRED`,
`AUTH_EXPIRED`, `INVALID_CONFIGURATION`, `RATE_LIMITED`, `RETRY_AFTER`,
`TIMEOUT`, `NETWORK`, `ROBOTS_DENIED`, `SCHEMA_DRIFT`, `DELETED`, and
`UNEXPECTED_RESPONSE`. API keys and authorization headers are excluded from
diagnostics, crawl metadata, and logs.

## Known limitations

- The connector requires explicit employer authorization and cannot discover
  Teamtailor companies generically.
- OAuth and credential synchronization are unsupported.
- The fixed API version changes only through a reviewed connector update.
- Internal, unlisted, archived, draft, and scheduled jobs are intentionally
  excluded even if a broader key could read them.

Reference:

- [Teamtailor API](https://docs.teamtailor.com/)
