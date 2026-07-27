# DP-2.2R — Public connector architecture review

Review date: 2026-07-27  
Scope: Greenhouse, Lever, Ashby, SmartRecruiters, Workable, Recruitee,
Comeet, Personio, and JobScore.

## Certification decision

**Superseded by DP-2.2P consolidation.**

The common registry, import boundary, identity index, duplicate lookup,
employer-specific robots checks, scheduler isolation, and crawl persistence are
sound after the corrections made in this review. The remaining gaps are
architectural rather than provider defects: diagnostics, retry policy, schema
validation, deletion reconciliation, and test contracts are not yet uniform
enough to use this implementation unchanged for credential-bearing providers.

The required refactors below were completed in DP-2.2P: typed persisted errors,
one request/retry pipeline, capability-derived execution, complete-feed
reconciliation, a universal contract harness, and standardized connector
documentation. This document remains the audit record that motivated the
consolidation.

## Corrections made during certification

1. Greenhouse, Recruitee, and Comeet now pass their external posting IDs into
   the canonical import pipeline. All nine public connectors therefore use the
   database identity `(source, company, sourceJobId)` first, canonical URL
   second, and fingerprint third.
2. Robots validation now targets the exact employer feed path for every public
   provider. Lever's EU host and Ashby's API host are selected correctly.
3. Shared robots diagnostics no longer contain Greenhouse-specific wording.
4. SmartRecruiters detail fetches now use
   `/v1/companies/{company}/postings/{id}` rather than appending an ID after the
   collection query string.
5. Regression tests cover the exact robots target for all nine providers and
   identity propagation for the three corrected adapters.

## Architecture findings

| Review area | Decision | Evidence / residual issue |
|---|---|---|
| Registration | Pass | All providers implement `JobSourceProvider` and are registered once through `JobSourceRegistry`. |
| Discovery lifecycle | Partial | Every provider crosses discover → fetch → normalize → validate → shared import. Only Greenhouse, Personio, and JobScore provide complete discovery diagnostics; the generic JSON adapter supplies empty fallback diagnostics. |
| Capabilities | Pass | `capabilities.ts` and the provider audit identify all nine as implemented documented public interfaces. Workday remains deliberately blocked and is not certified as a public connector. |
| Identity | Pass after correction | All nine populate `providerExternalId`; persistence queries provider/company/source ID, canonical URL, then fingerprint. The database enforces the provider identity tuple. |
| Deduplication | Pass | One shared transactional import path prevents repeat records and records duplicate activity. Fingerprint remains globally unique as the tertiary defense. |
| Normalization | Partial | All providers produce the shared import input. JobScore and Personio preserve newer canonical fields; older adapters do not consistently expose documented department, apply URL, opened/updated dates, or raw metadata. |
| Missing values | Pass with caveat | Persistence converts absent optional scalar values to null. Some legacy adapters combine explicit remote/workplace signals into location; the shared importer then derives `remoteStatus` from that location text. |
| Deletion handling | Not certified | Workable, Ashby, Personio, and JobScore detect a posting missing during refetch. Other detail endpoints fail generically. No provider reconciles jobs absent from a later full feed into `closedAt`; the column exists but discovery does not populate it. |
| Scheduling | Pass for present policies | Scheduling is shared. JobScore defaults to daily and has a runtime one-hour floor, including manual runs. Other providers retain manual defaults because no stricter certified vendor default is encoded. |
| Rate limiting | Pass | The runner applies connector rate budgets and robots crawl delay before detail fetches. JobScore additionally enforces its vendor-specific polling floor. |
| Retry behavior | Partial | JobScore honors `Retry-After` and uses bounded exponential backoff with jitter. Other adapters use a single 15-second request and do not share a retry policy. |
| Robots | Pass after correction | One evaluator, fail-closed request errors, exact per-employer paths, batch cache keyed by robots URL and feed path, and consistent crawl diagnostics. A published 404 is treated as no policy, consistent with the current certified policy. |
| Error model | Partial | Runner status and persistence are common, but adapters emit free-form errors. Equivalent timeout, network, malformed JSON, schema drift, missing ID, and deletion cases do not yet map to a common typed vocabulary. |
| Diagnostics | Not certified | Crawl totals and status are common. Detailed exclusion diagnostics exist for only three providers, and `lastError` retains provider-specific text rather than a stable code plus safe detail. |
| Persistence | Pass with caveat | Canonical fields are nullable; source identity and fingerprint are unique; imports are transactional. Repeat imports update last-seen and newer JobScore fields but record, rather than apply, several changed canonical posting values. |
| Tests | Partial | Registry, normalization, shared persistence, exact robots targets, scheduling, and repeat imports are covered. Personio and JobScore have the strongest malformed/schema/ID/deletion suites; the other seven do not have equivalent contract fixtures. |
| Documentation | Partial | Provider matrix, capability registry, architecture, and the Personio/JobScore/Greenhouse documents are synchronized. Six implemented providers lack dedicated connector contract documents. |

## Provider comparison

| Provider | Adapter shape | Detailed diagnostics | Strict feed schema | Source identity | Missing-on-fetch signal | Retry policy |
|---|---|---:|---:|---:|---:|---:|
| Greenhouse | Custom JSON | Yes | Partial | Yes | HTTP failure | None |
| Lever | Shared JSON | No | No | Yes | HTTP failure | None |
| Ashby | Shared JSON + collection refetch | No | No | Yes | Explicit not-found | None |
| SmartRecruiters | Shared JSON | No | No | Yes | HTTP failure | None |
| Workable | Shared JSON + collection refetch | No | No | Yes | Explicit no-longer-public | None |
| Recruitee | Custom JSON | No | No | Yes | Generic normalization/fetch failure | None |
| Comeet | Custom JSON | No | No | Yes | Generic normalization/fetch failure | None |
| Personio | Strict XML | Yes | Yes | Yes | Explicit no-longer-public | None |
| JobScore | Strict JSON | Yes | Yes | Yes | Explicit no-longer-public | Retry-After + backoff/jitter |

“None” means no connector-level retry beyond a future scheduled scan; it does
not imply that retry is required by that provider's current public contract.

## Database review

- `Job.sourceJobId` is nullable so manual imports remain valid.
- `@@unique([sourceId, companyId, sourceJobId])` enforces the provider identity
  when an external ID is present.
- `Job.sourceUrl` is checked as the secondary identity but is not uniquely
  indexed. Concurrent imports are serialized by SQLite in this local
  application, but a future multi-writer database would require an additional
  constraint or conflict strategy.
- `Job.fingerprint` is globally unique and remains the tertiary identity.
- Department, application URL, opened date (`postedAt`), and provider-updated
  date are nullable and do not fabricate absent values.
- `closedAt` has no discovery reconciliation owner. Deleted-job certification
  is therefore incomplete despite individual refetch tests.
- The two DP-2.2B additive migrations are consistent with the schema and
  preserve existing data.

## Recommended refactors before authenticated providers

### Required

1. Introduce a typed provider error model with stable codes for `timeout`,
   `network`, `rate_limited`, `malformed_feed`, `schema_drift`, `missing_id`,
   `duplicate_id`, `deleted`, `robots_denied`, `authentication`, and
   `unexpected_response`. Persist the code separately from provider detail.
2. Make detailed discovery diagnostics mandatory in `JobSourceProvider`.
   Move matching/exclusion accounting into a shared helper so equivalent inputs
   produce equivalent counts and warnings.
3. Add a shared request policy supporting timeout classification,
   `Retry-After`, bounded exponential backoff, and injectable clock/sleep/jitter.
   Provider capability data should select the allowed retry and polling policy.
4. Define feed reconciliation semantics. A successful complete feed may mark
   previously seen provider/company IDs as closed; a failed or partial feed
   must never close them.
5. Add a provider contract test harness run against every adapter: single and
   multiple jobs, optional fields, missing/duplicate IDs, malformed/schema
   input, invalid canonical URL, deletion, identity, repeat import, robots
   denial, timeout/network response, and diagnostics.

### Recommended

6. Expand the generic normalized posting boundary to carry explicit department,
   application URL, opened/updated dates, remote state, and approved metadata.
   Populate only fields documented by each provider.
7. Decide whether repeat imports should apply verified posting changes or only
   record them. The current mixed behavior updates dates/application URL while
   merely logging title, location, compensation, and description changes.
8. Move provider request targets and operational policies into declarative
   capability records so registration, robots, scheduling, and diagnostics
   cannot drift independently.
9. Add dedicated connector contract documentation for Lever, Ashby,
   SmartRecruiters, Workable, Recruitee, and Comeet.

## Risk assessment

- **Low:** registry, shared validation/import boundary, transactional
  persistence, current identity tuple, repeat-import prevention, scheduler
  isolation, exact robots validation.
- **Medium:** canonical field completeness, source URL concurrency guarantees,
  mixed repeat-update semantics, lack of connector-specific documentation.
- **High before authenticated providers:** untyped errors, inconsistent
  diagnostics, non-uniform request/retry behavior, incomplete schema guards,
  and absence of feed-level deletion reconciliation.

The existing nine public connectors may continue operating within their
documented public-feed scope. Credential-bearing connectors should wait for the
required shared refactors because authentication failures, token throttling,
partial pagination, and authorization-sensitive diagnostics need stronger
guarantees than the present public connector layer provides.
