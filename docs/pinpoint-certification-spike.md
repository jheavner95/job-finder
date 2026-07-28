# DP-2.2E — Pinpoint certification spike

## Executive summary

**Classification: SUPPORTED**

Pinpoint qualifies for the existing **Public Provider** architecture through
its officially documented, unauthenticated Job Postings JSON endpoint:

```text
https://{company-subdomain}.pinpointhq.com/postings.json
```

Pinpoint documents this endpoint for retrieving current public postings for
display on another website, permits client-side access without CORS
restrictions, publishes the response schema, and supports explicit locale
paths. The feed provides a unique posting ID and canonical public URL and
returns every posting, including multiple postings for one underlying job.

No authenticated access, employer feed provisioning, browser inspection,
scraping, undocumented endpoint, or new connector architecture is required.
Implementation may proceed as a normal public provider, subject to
per-employer robots validation and the safeguards below.

## Evidence reviewed

Only first-party Pinpoint documentation was used:

- [Job Postings JSON Endpoint](https://developers.pinpointhq.com/docs/jobs-json-endpoint)
- [Job Feeds Overview](https://developers.pinpointhq.com/docs/job-feeds-overview)
- [API introduction](https://developers.pinpointhq.com/docs/introduction)
- [API authentication](https://developers.pinpointhq.com/docs/authentication)
- [List Jobs API](https://developers.pinpointhq.com/reference/get-jobs)
- [API rate limits](https://developers.pinpointhq.com/docs/rate-limits)
- [Jobs Widget Overview](https://developers.pinpointhq.com/docs/jobs-widget-overview)
- [API changelog](https://developers.pinpointhq.com/changelog)

No browser network traffic, public-site HTML, scripts, or inferred frontend
requests were examined.

## Capability matrix

| Area | Certified finding | Decision |
|---|---|---|
| Public interface | Documented tenant-scoped `postings.json` endpoint | Supported |
| Authentication | None for the public feed; CORS-enabled | Public Provider |
| Employer authorization | Not required for already-public postings | Supported |
| Published schema | Detailed fields, datatypes, and examples | Supported |
| Stable identity | Top-level posting `id` is documented as unique | Supported |
| Underlying job identity | Nested `job.id` and `job.requisition_id` | Metadata only |
| Canonical URL | Explicit posting `url` and `path` | Supported |
| Multiple postings | `postings.json` returns every posting | Supported |
| Pagination | None documented; one `data` collection | Complete single response |
| Deletion | Feed represents current listed postings | Absence reconciliation |
| Filtering | Department, location, division, structure group, and city/state | Supported; never filter reconciliation runs |
| Locale | Explicit locale path; English default and fallback | One configured locale |
| Public feed rate limit | No numeric limit documented | Conservative schedule |
| Authenticated API limits | 120 requests/IP per minute and 240 per eight minutes; 429 supplies reset and Retry-After | Informational |
| Versioning | `postings.json` replaces deprecated `jobs.json`; public URL is unversioned | Schema monitoring required |
| Regions | Tenant hostname and locale behavior documented; no separate feed regions | No regional branching |
| Robots | No provider-wide exception documented | Per-employer, fail closed |
| Typed diagnostics | HTTP and schema failures fit existing codes | Supported |

## Architecture fit

### Selected pattern: Public Provider

The public feed fits the existing platform lifecycle:

1. resolve a reviewed tenant subdomain from the canonical careers URL;
2. validate robots for `/postings.json` or the configured locale path;
3. download JSON through the shared request executor;
4. validate the documented schema;
5. normalize supported public fields;
6. apply canonical identity and duplicate prevention;
7. match and persist;
8. reconcile only after a successful unfiltered complete response; and
9. persist shared typed diagnostics.

The authenticated API pattern is technically possible. Pinpoint's v1 REST API
uses an employer-generated `X-API-KEY` and page-number/page-size pagination.
It is unnecessary for discovery and can expose internal, private, or
confidential records that this connector must never request.

The Employer Feed pattern is also unnecessary because Pinpoint already
publishes a supported tenant-scoped public feed.

## Discovery feasibility

### Identity and repeat-import prevention

Use the existing identity hierarchy:

1. primary: `(pinpoint, configured company, posting.id)`;
2. secondary: canonical `url`;
3. tertiary: shared fingerprint.

Use the top-level posting ID, not nested `job.id`. Pinpoint permits multiple
public postings for one job; using the job ID would incorrectly merge location,
language, or posting variants. Preserve nested job and requisition IDs as
provider metadata.

### Normalization

The published feed supplies title; description; responsibilities; skills;
benefits; employment type; workplace type; location; department; division;
visible compensation, currency, and frequency; deadline; canonical URL and
path; and posting, job, and requisition IDs.

Populate only present fields. Ignore compensation when
`compensation_visible` is false. Select one locale deterministically; do not
merge localized feeds into duplicate opportunities.

### Completeness and deletion

Pinpoint says `postings.json` returns all postings as displayed on the career
site and documents no pagination. This supports complete-feed reconciliation
under these mandatory constraints:

- use the unfiltered feed for reconciliation;
- require successful parsing and normalization of the full response;
- require every matched import to succeed;
- require an empty response to retain the certified root schema;
- never close jobs after network, timeout, robots, 429, malformed JSON, schema,
  or import failures; and
- never treat a locale change as mass deletion.

No tombstone is published. Use
`absent_from_successful_complete_feed` as the reconciliation reason.

## Security assessment

Public discovery requires no credential. Pinpoint explicitly directs
client-side consumers to the unauthenticated postings endpoint. The
authenticated API key must remain server-side and is out of scope.

Only postings intentionally exposed by the employer's public Pinpoint careers
site may be read. Never request internal, private, confidential, draft, or
archived jobs, and never add authenticated access as a fallback.

The official documentation establishes intended reuse for displaying current
jobs externally. It does not waive employer-specific robots policy or
contractual restrictions. Check each tenant host, cache the decision, and fail
closed on ambiguity or denial.

## Operational limitations

- The public feed is unversioned; strict validation and changelog monitoring
  are required.
- No public-feed-specific numeric rate ceiling is published. Default to daily,
  honor `Retry-After`, and use bounded shared backoff.
- Identity and counts must be posting-centric because one job can have multiple
  postings.
- Locale fallback can produce partially identical content. Configure one locale.
- Filtered feeds are partial and must never reconcile deletions.
- Custom career domains are not certified feed hosts unless Pinpoint documents
  or the employer verifies their mapping to a Pinpoint subdomain.

## Risk assessment

| Risk | Level | Mitigation |
|---|---|---|
| Legal/authorization | Low | Official external-display endpoint plus per-tenant robots/terms checks |
| Credential exposure | Low | No credential in public mode |
| Schema regression | Medium | Strict validator, fixtures, changelog monitoring |
| Duplicate identity | Low | Unique posting ID, canonical URL, fingerprint |
| False deletion | Medium | Unfiltered complete feed and zero-failure reconciliation |
| Rate limiting | Low–Medium | Daily default, shared retries, conservative polling |
| Locale duplication | Medium | One configured locale, posting-centric identity |
| Implementation regression | Low–Medium | Existing public JSON and universal contract patterns |

## Recommendation

Proceed with a separately scoped Pinpoint public connector implementation.

- **Classification:** SUPPORTED
- **Architecture:** Public Provider
- **Implementation priority:** P1, after certification acceptance
- **Complexity estimate:** Medium; approximately 3–5 engineering days,
  including fixtures, contract certification, reconciliation tests,
  documentation, and verification
- **New architecture required:** No
- **Employer credentials required:** No
- **Complete-feed reconciliation:** Yes, with the safeguards above

Implementation must use only `postings.json`, not deprecated `jobs.json`, the
authenticated API, widgets, career-site HTML, or observed browser requests.
