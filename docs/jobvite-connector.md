# Jobvite employer feed connector contract

## Authorization and onboarding

Jobvite runs only from a feed intentionally supplied and reviewed by the
employer. Onboarding accepts the feed URL and the employer's Jobvite
`companyId`, then performs this fail-closed sequence:

1. validate HTTPS configuration and supported `jobvite-v2` schema;
2. retrieve every page with the shared request executor;
3. certify stable IDs, canonical URLs, ownership, publication fields,
   uniqueness, and complete retrieval;
4. validate robots for the exact feed path;
5. save the feed configuration in macOS Keychain; and
6. mark the already-registered connector valid and enable discovery.

Invalid or denied feeds remain disabled. Replacement is atomic: the previous
configuration remains active unless the replacement passes all checks. Removal
deletes the Keychain item, clears non-secret feed metadata, and disables the
connector. SQLite stores only status, validation time, schema version, origin,
and path. It never stores the full URL or its query parameters.

## Supported feed

The connector supports Jobvite's documented JSON Job Feed/Get Job API record
shape supplied by an employer. It accepts a single record, an array, or a
`jobs`/`requisitions` array and an optional `links.next`/`next` pagination link.
Every pagination link must remain on the reviewed feed origin.

Required certification fields are:

- `eId`, `companyId`, `title`, and `detailLink`;
- `jobState`, `postingType`, and boolean `distribution`;
- one consistent configured `companyId`;
- unique IDs and canonical detail URLs.

Only records that are open, external, distributed, non-internal, and non-private
are active. The connector never discovers endpoints, scrapes career-site HTML,
reuses browser sessions, or calls job detail pages.

## Capabilities and request policy

- authentication type: `employer-feed`
- feed: supported
- pagination: same-origin feed links
- Retry-After: supported
- timeout, bounded retries, exponential backoff, and jitter: shared policy
- polling floor: one hour
- default schedule: daily after certification
- deletion: complete-feed reconciliation
- robots: supplied feed origin and exact path

## Identity, normalization, and deletion

Primary identity is `(Jobvite source, configured company, eId)`. `detailLink`
is secondary and the shared fingerprint is tertiary.

The adapter maps only supplied title, description, detail/apply links, category
or department, location, job type, sent date, and updated date. It does not
infer salary, remote status, or missing dates.

A job can close only after complete pagination, successful schema and ownership
certification, and successful import of every matched record. A partial page,
network/timeout/robots failure, malformed feed, normalization failure, or
import failure never reconciles deletions. Explicitly unpublished Jobvite
records are absent from the active ID set and close only through that successful
complete-feed reconciliation.

## Diagnostics and known limitations

The connector uses the platform error vocabulary:
`INVALID_CONFIGURATION`, `NETWORK`, `TIMEOUT`, `RATE_LIMITED`, `RETRY_AFTER`,
`MALFORMED_FEED`, `SCHEMA_DRIFT`, `MISSING_ID`, `DUPLICATE_ID`,
`ROBOTS_DENIED`, `UNEXPECTED_RESPONSE`, and `DELETED`. `AUTH_REQUIRED` remains
reserved for a future credential-based Jobvite contract.

The connector does not accept arbitrary public Jobvite career URLs as feeds.
Jobvite's Job Feed API is a paid customer integration and may include a key and
secret in its supplied URL; such URLs must be handled as private configuration.
The documented 500-request daily limit is protected by a one-hour platform
floor and daily default.

Reference:

- [Jobvite Job Feed API Integration Guidelines](https://careers.jobvite.com/careersite/job_feed_api.html)
