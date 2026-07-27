# Architecture

## Runtime data flow

```text
SQLite → Prisma → server query functions → App Router server pages
                                      ↘ typed view models → client decision form

client decision form → validated server action → UserDecision
                                               → ActivityEvent (on transition)
                                               → path revalidation
```

Production runtime code never imports development or test fixtures. A fresh database starts empty.

## Data ownership

- `Job` preserves original source text and normalized searchable fields.
- `JobEvaluation` stores the automated numeric score, version, reasoning, and category results.
- `CandidateEvidence` links an evaluation to supplied context evidence.
- `UserDecision` stores the user’s workflow judgment independently of evaluation data.
- `ActivityEvent` provides an append-only history of meaningful status transitions.

The displayed status is the latest user decision when one exists; otherwise it falls back to the imported job status.

## Mutation design

The status form calls a server action directly. Zod validates the job identifier, supported status, and optional note. Prisma writes the decision and transition activity in one transaction. Errors return a visible live-region message; successful writes revalidate dashboard, queue, reports, and detail paths.

## Context calibration and scoring design

Each context Markdown file declares explicit readiness metadata: `missing`, `template`, `partial`, or `ready`. `lib/context-readiness.ts` validates those values and calculates the displayed percentage with fixed weights. It does not infer completeness from file size or prose length.

Scoring is a pure function with centralized typed configuration. It returns:

- a `0–100` match score normalized over known non-penalty evidence;
- a `0–100` confidence percentage based on known versus applicable weighted evidence;
- an eligibility state determined by separate hard-requirement checks; and
- category results that explicitly label evidence as positive, negative, missing, or not applicable.

Unknown optional evidence has zero contribution and lowers confidence, not match. Not-applicable evidence is excluded from the confidence denominator. Risk is a distinct negative contribution. Hard requirement conflicts do not silently change the weighted score.

## Duplicate fingerprint design

Fingerprinting applies deterministic normalization to company, title, location, and source identifier, then hashes the canonical string with FNV-1a. It tolerates casing, whitespace, punctuation, common company suffixes, senior-title abbreviations, and supported US-remote variants.

Fingerprint collisions and semantic mismatches remain possible. Source identifiers improve precision but can create false negatives when the same posting is syndicated under different IDs.

Provider connectors also preserve the provider's external job identifier in
`Job.sourceJobId`. For certified feeds, `(source, company, sourceJobId)` is a
database-enforced primary identity. Canonical URL and fingerprint checks remain
secondary duplicate defenses.

## Discovery provider boundary

Every provider implements the shared discover, fetch, normalize, validate, and
health contract. Provider-specific transports stop at the canonical import
boundary; matching, scoring, duplicate handling, and persistence stay in the
shared pipeline.

Personio uses its documented employer-scoped XML feed with one deterministic
locale. Tenant robots policy is checked against `/xml` before discovery and
cached for the batch. See [Personio public connector](personio-connector.md).

JobScore uses its documented employer-scoped JSON feed. It preserves JobScore's
position ID, detail URL, application URL, department, and source dates without
inventing absent values. Discovery defaults to daily, enforces a one-hour
minimum polling interval, honors `Retry-After`, and uses bounded exponential
backoff with jitter. See [JobScore public connector](jobscore-connector.md).

The cross-provider certification status, identified drift, and prerequisites
for authenticated connectors are recorded in the
[public connector architecture review](public-connector-architecture-review.md).

## Consolidated Discovery Platform

DP-2.2P establishes one permanent connector framework:

- `capabilities.ts` declares robots targets, timeouts, retry policy, polling
  floors, default schedules, completeness, deletion, pagination, and
  authentication support.
- `request-policy.ts` owns every provider request, timeout classification,
  Retry-After handling, bounded exponential backoff, jitter, and retry count.
- `errors.ts` defines stable provider error codes and safe diagnostic payloads.
- complete discovery results carry the full provider ID set; successful
  complete feeds reconcile `lastSeenAt`, `closedAt`, and
  `reconciliationReason`, while failed or blocked runs never close jobs.
- the universal provider contract harness is mandatory for every registered
  connector and verifies canonical identity, normalization, diagnostics, feed
  completeness, and operational capability declarations.

Provider transports remain responsible only for endpoint construction, schema
parsing, and mapping documented fields. Execution, policy, diagnostics,
identity, persistence, and reconciliation are platform responsibilities.

## Deliberate boundaries

The application remains local, private, and single-user. Discovery is limited
to certified public or explicitly authorized provider interfaces. It contains
no external authentication, automatic applications, or employer communication.
