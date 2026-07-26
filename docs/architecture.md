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

## Deliberate boundaries

Version 1 is local, private, and single-user. It contains no ingestion, scraping, scheduling, authentication, external AI, automatic applications, or employer communication.
