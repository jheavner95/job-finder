# Deferred architecture cleanup

Findings surfaced during the UX phases that are **architecture cleanup, not UX work**.
None of these block a UX phase. Each deserves its own scoped package with its own
verification, because each touches persisted structure or shared design tokens.

Opened at the close of UX-4 and reconciled at UX-C (2026-08-10). Nothing here has
been started.

## Classification at UX-C

| | Finding | Class | Urgency |
|---|---|---|---|
| A | Legacy ATS subsystem | Engineering debt | LATER |
| B | Dead `Job.status` | Engineering debt | LATER |
| C | `--faint` contrast token | Cosmetic debt | SOON |
| D | Employment-type strings | Product decision | SOON |
| E | Insights ATS analytics | Product decision | SOON |
| F | Cosmetic route paths | Cosmetic debt | OPTIONAL |
| G | Engine tools on Companies | Engineering debt | LATER |
| H | Board tokens as company names | Engineering debt | SOON |
| I | No persisted target level | Product decision | LATER |
| J | No AI evidence capability | Future capability | SOON |
| K | Onboarding never completes | Product decision | SOON |
| L | Persisted engine language in `OpportunityIntelligence` | Engineering debt | LATER |
| M | Dead profile-readiness helpers | Engineering debt | OPTIONAL |

Nothing here is classified RESOLVED or OBSOLETE: every item was re-verified against the
running application at UX-C and still exists.

---

## A. Remove the unreachable legacy ATS subsystem

UX-4 made applications a derivation of `UserDecision`, which left an entire
applicant-tracking implementation with no route into it and no rows in it.

**Code, all currently unreachable:**

- `app/applications/[id]/` — application detail page
- `app/applications/new/` — the conversion form that used to create `Application` rows
- `app/applications/reminders/`
- `app/applications/ApplicationKanban.tsx`
- `app/applications/ApplicationWorkspaceControls.tsx`
- `app/applications/actions.ts` — 463 lines, 14 server actions
- `lib/application-intelligence.ts` — 18 lifecycle stages, transition validation

**Schema, all zero rows:** `Application`, `ApplicationStatusHistory`,
`ApplicationTimelineEvent`, `ApplicationContact`, `ApplicationCommunication`,
`ApplicationDocument`, `ApplicationInterview`, `ApplicationFollowUp`,
`ApplicationAttentionDismissal`.

Dropping nine tables is a migration. Deleting the code is not, and could go first.
Check `app/insights/page.tsx` and finding E before removing the Prisma models.

## B. Resolve the dead `Job.status` model

`Job.status` is `NEW` for all 429 rows and is never written. It conflates four
separate concepts in one enum:

| Concept | Values |
|---|---|
| Discovery classification | `NEW`, `STRONG_MATCH`, `POSSIBLE` |
| User decision | `SAVED`, `APPLIED`, `REJECTED` |
| Application lifecycle | `INTERVIEWING`, `OFFER` |
| Posting availability | `CLOSED` |

It survives only as an unreachable fallback in `currentStatus()` in `lib/queries.ts`
(`job.decisions[0]?.decision ?? job.status`). `UserDecision` is the real source of
truth. Removing the column is a migration; narrowing what `JobStatus` means, and to
which model it belongs, is the design question to settle first.

## C. Audit informational uses of `--faint` for WCAG AA

`--faint` (`#6f7973`) measures **4.19:1** on `--paper` (`#f6f7f4`) — below the 4.5:1
AA threshold for normal text. `--muted` (`#68736d`) measures 4.58:1 and is the
correct token wherever the text carries information rather than decoration.

UX-4 fixed its own usages (`.app-when`, `.app-state-closed`,
`.opportunity-application`). Remaining informational uses to audit include
`.opp-reason` and `.opp-more span`. The broader question is whether `--faint`
should be darkened at the token level instead of replaced at each call site.

## D. Normalize raw ATS employment-type strings

Employment type is rendered verbatim from the provider, so one list shows
`FullTime`, `Fulltime Employee`, `Full-time`, and `Permanent Full Time Employee`
for the same fact. Normalising is not purely mechanical: `Permanent` distinguishes
a real contract type from a phrasing variant, so the mapping needs deciding before
it is written. Placeholder suppression is already handled by `stated()` in
`lib/opportunity-presentation.ts`.

## E. Revisit Insights analytics that assume legacy ATS data

`app/insights/page.tsx` now reads the same derived applications as every other
surface, so its counts are truthful. Its deeper analytics still assume records the
derived model does not produce:

- **Response rate / days to first response** — need timeline events with recruiter,
  view, or interview types. Only the unused ATS created those.
- **Follow-up completion rate** — needs `ApplicationFollowUp` rows. UX-4 deferred
  follow-up scheduling deliberately; there is no storage for it.
- **Documents, providers, industries** sections — fed by fields only the conversion
  form ever populated.

UX-4 widened `interviewed()` in `lib/career-performance.ts` to accept a recorded
`Interviewing` state as evidence. The rest currently reports "Not enough historical
data yet", which is true but will stay true forever unless either the derived model
grows or these metrics are retired.

---

## F. Cosmetic route paths (added at UX-5)

Two URLs no longer describe what they serve:

- `/sources` serves **Companies** (the user's watchlist).
- `/review` serves **Opportunities**.

Both have carried the right H1 for several phases. Repointing them would break
bookmarks and history to buy nothing a user can see, so UX-5 left them. If they
are ever renamed, do it with redirects from the old paths and update
`docs/route-map.md`.

## G. Engine tooling still living on Companies (added at UX-5)

Behind the collapsed "Provider information · Advanced" disclosure on `/sources`
sit three engine tools: supported-provider documentation, the Greenhouse board
directory, and "Compare public job URLs". They satisfy the UX-5 boundary because
they are behind progressive disclosure, but they are System's subject matter and
would sit more naturally under `/system/sources`. Moving them means relocating
`addMissingGreenhouseBoardAction`, `bulkImportGreenhouseBoardsAction` and
`compareMyGreenhouseUrlsAction` along with their UI.

## H. Board tokens stored as company names (added at UX-5)

`CompanyConnector.company` holds values like `4lu44n1n37w012k` and `66degrees` —
board tokens that were never resolved to a display name. They render as company
names on Companies. This is a data-quality problem in the employer resolution
layer, not a presentation bug: the fix is to backfill display names where the
provider exposes one, and it touches persisted rows.

---

## I. No persisted target career level (added at UX-6)

The target level band is **derived** from the free-text titles in
`CandidateCareerPreferences.preferredRoles`, not stored. UX-6 labels it as
derived wherever it appears, which is honest, but it means the user cannot say
"I want Staff roles" directly — they can only say it by listing titles that
imply Staff. Adding a stored target band is a schema change and a Level Fit
semantics question, so it was not done here.

Related symptom in live data: `preferredRoles` currently holds
`"Senior Product Desginer"` and `"Principle Product Designer"` — user typos that
feed level derivation. UX-6 deliberately does **not** silently correct them;
they are the user's own words. A future package could offer a suggestion when a
title nearly matches a known ladder rung.

## J. No way to record AI product experience as evidence (added at UX-6)

`"AI Products"` is expressible as a target industry and is stored today, so the
targeting side of the user's AI ambition works. The evidence side does not:
`CandidateIntelligenceEvidence` holds 20 records across skills, industries,
products and domains, and none of them concern AI or generative/agentic product
work. DE-3J already found AI appears only as a *missing-evidence* note on
opportunities.

So the product can say "I want AI roles" but cannot say "here is my AI work".
Closing that needs either résumé/portfolio evidence that mentions it or a way to
declare capability evidence by hand — a real capability, not a UX-6 change.

## K. Onboarding never completes (added at UX-6)

`CandidateOnboarding` sits at step 5 of 5 with `completedAt` null, so
"Getting Started" stays pinned in the sidebar indefinitely. Every step's work is
done; only the final confirmation was never pressed. UX-6 removed the reason to
return there (preferences are now editable on Your Profile) but did not change
the completion logic. Worth deciding whether reaching step 5 should complete it.


## L. Persisted engine language in OpportunityIntelligence (added at UX-7)

`lib/candidate-intelligence/engine.ts` writes, for each unmet requirement:

> "The opportunity asks for X, but the structured candidate profile contains no
> confirmed evidence for it."

"Structured candidate profile" describes a data structure to someone who did not ask
about one. UX-7 rewrote it, then reverted: the sentence is **persisted across all 429
`OpportunityIntelligence` rows** and only regenerates when `INTELLIGENCE_VERSION` is
bumped. Shipping the reword without a bump would leave new and old opportunities
phrasing the same finding differently; shipping it with a bump rewrites 429 rows.

Impact is low — the sentence is understandable, merely not in the candidate's language
— so it did not justify a bulk data operation inside a UX phase. Fix is one string plus
a version bump plus a regeneration run, and it should be done deliberately.

## M. Dead profile-readiness helpers (added at UX-C)

UX-6 replaced the "Profile strength 49%" hero with an actionable gap list, and UX-7
removed the last percentage from Today. Three exported helpers that fed the old hero
now have no callers:

- `profileQuality()` in `lib/career-profile-presentation.ts`
- `careerProfileTasks()` in `lib/career-profile-presentation.ts`
- `estimatedProfileMinutes()` in `lib/career-profile-presentation.ts`

`evaluateContextLibrary()` in `lib/context-readiness.ts` is still used by
`/context/[id]`. Lint does not flag the three because they are exported. Deleting them
is safe but is not UX work, so UX-C recorded them rather than removing them during a
verification pass.
