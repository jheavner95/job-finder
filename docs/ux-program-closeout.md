# Job Finder UX Program Closeout

This describes the product that exists at the close of UX-1 → UX-7, verified against
the running application and the repository on 2026-08-10. It is a record, not a
design specification: everything below was checked, not proposed.

---

## 1. Purpose

Job Finder is a private, local-first career-intelligence application for one person —
an experienced Senior/Staff Product Designer targeting Product Design roles and roles
where product design meets generative and agentic AI.

The governing mandate throughout: **optimise for finding relevant jobs the user would
realistically consider applying to.** The acceptance test: *did Job Finder surface good
jobs I would realistically consider applying to?*

The engine work that precedes this program (DE-1 → DE-4) established the principle the
UX had to serve: **discovery favours recall; matching favours precision.**

Before UX-1 the product was eleven navigation items across four collapsible groups,
four separate opportunity lists, two employer models, an unreachable applicant-tracking
system, and candidate preferences editable only inside first-run onboarding.

---

## 2. Phase ledger

| Phase | Purpose | Major decision | Result | Certification |
|---|---|---|---|---|
| **UX-1** | Decision vocabulary and opportunity representation | One vocabulary, one shared opportunity row | `lib/opportunity-presentation.ts`; absences omitted rather than announced | Certified |
| **UX-2** | Today as the daily decision brief | Replace dashboard + briefing with a bounded brief | 5 curated + 4 new, quiet strip, no pipeline tiles | Certified |
| **UX-3** | Opportunities workspace | Browse / narrow / decide; filter-then-group for state, group-then-filter for lenses | 5 decision states, 7 lenses, paging; 29 screens → 4.5 | Certified |
| **UX-4** | Applications | Derive applications from `UserDecision`; do not populate the ATS | 4 states, one source of truth, zero migration | Certified after deleting 2 rows of test lifecycle data |
| **UX-5** | System boundary and navigation | Six primary destinations; machinery behind one door | 11 nav items → 6; `/system/*` workspace; 4 opportunity lists → 2 | Certified |
| **UX-6** | Your Profile | One place for candidate facts; no completion percentage | 9 stranded preferences relocated; declared vs derived distinguished | Certified |
| **UX-7** | Full audit and recertification | Verify the whole product; challenge earlier decisions | 8 P1 fixes, all by removal or reordering | **Certified with observations** |

UX-7's structural finding: several product rules had been applied to the surface being
edited and not propagated. UX-C's sweep found and corrected two further instances of
the same class (§13).

---

## 3. Information architecture

```
Today            /              the day's decisions
Opportunities    /review        the whole set: browse, narrow, decide
Applications     /applications  what happened after applying
Companies        /sources       the watchlist Job Finder monitors
Your Profile     /context       what Job Finder knows about you
──────────────────────────────
System           /system        whether discovery is working
```

Six flat destinations, always visible, no collapsing and no persisted nav state.
System sits below a rule and carries its own local navigation: Overview, Sources,
Scans, Schedules, Activity, Import.

`/sources` and `/context` keep their historical paths deliberately; renaming would
break links to buy nothing a user can see (deferred finding F).

**Secondary, reachable, not nav peers:** `/jobs/[id]` (canonical opportunity and
application detail), `/evidence`, `/context/writing-voice`, `/getting-started`,
`/insights` (surfaced from Applications only at ≥5 applications).

**Redirects:** `/discovery` → `/system/sources`, `/scan` → `/system/scans`,
`/searches` → `/system/schedules`, `/notifications` → `/system/activity`,
`/import` → `/system/import`, `/briefing` → `/`, `/reports` → `/review`.
Full table in [route-map.md](route-map.md).

---

## 4. Daily workflow

Today states the count and shows five roles → Opportunities holds all 249 with five
decision states and seven lenses → the opportunity page explains fit, level,
eligibility and work mode, and carries the decision buttons → marking applied writes a
decision → Applications shows it, and the opportunity page shows the same state in the
same words. Back-navigation is context-aware: an applied role returns to Applications,
everything else to Opportunities.

---

## 5. Product-wide UX rules

These are the rules the sweep in §13 verifies. They apply to every candidate-facing
surface, not only the one being edited.

1. Absent information is omitted, never announced.
2. No completion or readiness percentage is presented as candidate progress.
3. No metric that can only ever read zero is displayed.
4. Unavailable filters say so rather than silently showing something else.
5. Counts describing one concept agree on every surface.
6. Declared facts and derived conclusions are distinguishable in words.
7. Status is conveyed by text, never by colour alone.
8. Storage keys, filenames, board tokens and provider identifiers are not product language.
9. Recommendation-engine architecture is not explained to the user.
10. Operational controls live under System; Companies keeps only per-company health.

---

## 6. Models

**Opportunity.** 429 postings collapse to 293 opportunities by identical normalised
employer + title. Five tiers (Excellent ≥85, Strong ≥72, Worth Reviewing ≥58,
Stretch ≥42, Low Relevance <42). Six independent signals: craft match, tier,
confidence, level fit, eligibility, work mode. Tier is withheld when evidence coverage
falls below 0.5 and "Insufficient evidence" is shown instead.

**Application.** Derived entirely from `UserDecision`; there is no second record.
Four states — Applied, Interviewing, Offer, Closed. A `Rejected` decision means
passing on an opportunity before applying and the employer's answer after; only the
sequence distinguishes them, and it does so without a schema change.

**Candidate profile.** Nine preferences editable in one place. Target level and
current level are *derived* from role titles and résumé history and are labelled as
such — nothing stores a target level. Work authorization is never inferred.

**Companies.** `CompanyConnector` (403) is the user's watchlist, sorted by opportunity
count. `EmployerCandidate` (1,353) is a board-resolution queue and lives under System.

**Evidence.** 20 claims, 12 employment records, 6 projects. Confirmed claims are
separated from passing mentions. No percentages.

---

## 7. Source-of-truth rules

| Concept | Authority | Readers |
|---|---|---|
| Decisions | `UserDecision` | `lib/applications.ts` only |
| Applications | derived from decisions | Applications, opportunity detail, Today, Insights |
| Opportunity counting | `lib/opportunity-presentation.ts` | Today, Opportunities |
| "To review" | `needsReview()` | Today headline, Opportunities default state |
| Profile gaps | `lib/profile.ts` | Your Profile, Today strip |

`Job.status` is **not** authoritative: it is `NEW` on all 429 rows and never written
(deferred finding B).

---

## 8. Accessibility baseline

Verified across Today, Opportunities, opportunity detail, Applications, Companies,
Your Profile, Evidence and System:

- one `<h1>` per page, **0 heading skips**
- **0 unlabelled form fields**; `aria-describedby` targets resolve
- `aria-current` on primary and nested navigation simultaneously
- status conveyed as words everywhere (tiers, application states, system verdict,
  derived-fact markers)
- informational text at `--muted` (4.6:1) or better; `--warning` 5.4:1
- native form controls and native `<details>` disclosures throughout

`--faint` (4.19:1) remains below AA and is deferred finding C; no *informational* use
of it remains on the audited surfaces.

---

## 9. Benchmark baseline

| Benchmark | Result |
|---|---|
| Product Design discovery recall | **55/55 (100%)** |
| AI Product Experience discovery recall | **23/27** |

The four AI misses are stable and known: openai *Model Designer*, spotify
*Senior Conversation Designer*, sigmacomputing *Senior Product Designer, AI*,
okta *Staff Product Designer — AX & Growth*.

No UX phase changed scoring mathematics, thresholds, role relevance filtering,
provider architecture, or benchmark fixtures.

---

## 10. Deferred findings

Twelve items, classified in the UX-C report and recorded in
[deferred-architecture-cleanup.md](deferred-architecture-cleanup.md). None of them
blocks daily use; four are product decisions rather than engineering work.

The largest are: the unreachable ATS subsystem (9 empty tables), the dead `Job.status`
enum, the absence of any way to record AI product experience as evidence, and
persisted opportunity-guidance text that needs a coordinated regeneration across 429
records to reword.

---

## 11. Certification

UX-7: **certified with observations**. UX-C: the program is closed.

The broad UX refinement program is complete. Further work on Job Finder should target
coverage and capability, not another general UX pass.
