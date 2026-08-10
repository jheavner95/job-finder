# Route map

Where every route sits after UX-5, and why.

The product is six destinations. Everything the engine needs to say about itself
is behind one of them.

```
Today            /
Opportunities    /review
Applications     /applications
Companies        /sources
Your Profile     /context
─────────────────────────
System           /system
```

## Primary product

| Route | Surface | Owns |
|---|---|---|
| `/` | Today | The day's decisions |
| `/review` | Opportunities | The whole opportunity set: browse, narrow, decide |
| `/jobs/[id]` | Opportunity detail | The canonical detail surface, including application state |
| `/applications` | Applications | What happened after applying |
| `/sources` | Companies | The watchlist: companies Job Finder monitors |

`/sources` keeps its URL. Its H1 has read "Companies" for some time; repointing
the path would break bookmarks to buy a cosmetic gain. The URL is cosmetic debt,
recorded in the deferred cleanup rather than fixed here.

## Profile — consolidated by UX-6

| Route | Status |
|---|---|
| `/context` | **Temporary target** of the "Your Profile" nav item |
| `/evidence` | Reachable, not a nav peer |
| `/context/writing-voice` | Reachable, not a nav peer |

UX-6 decides how the three consolidate. The nav label is already "Your Profile"
so the target IA is visible; only the destination is provisional.

## System

| Route | Was | Owns |
|---|---|---|
| `/system` | *(new)* | Is discovery working, when did it last run, what is failing |
| `/system/sources` | `/discovery` | Providers, market coverage, board resolution queue |
| `/system/scans` | `/scan` | Scan results and history, manual scan |
| `/system/schedules` | `/searches` | Per-company crawl schedule and role criteria |
| `/system/activity` | `/notifications` | What discovery has done |
| `/system/import` | `/import` | Manual posting intake |

## Redirects

Old paths still resolve so links, bookmarks and history keep working.

| From | To | Why |
|---|---|---|
| `/discovery` | `/system/sources` | Decomposed: its opportunity lists went to Today/Opportunities, its employer list to Companies, its provider machinery here |
| `/scan` | `/system/scans` | Moved wholesale |
| `/searches` | `/system/schedules` | Moved and renamed — it never held saved searches |
| `/notifications` | `/system/activity` | Moved and renamed — every entry is a scan result |
| `/import` | `/system/import` | Moved wholesale |
| `/reports` | `/review` | Redundant: one figure ("94 Strong Fit or better of 429 found") that Today states and Opportunities can filter, in postings rather than opportunities |
| `/briefing` | `/` | Superseded by Today, which UX-2 built to replace it |

## Reachable, not in navigation

| Route | Why |
|---|---|
| `/insights` | Linked from Applications once there are 5 applications — its own threshold for reporting anything. Below that every metric reads "Not enough historical data yet". |
| `/getting-started` | First-run onboarding; appended to navigation only while incomplete |
| `/applications/[id]`, `/applications/new`, `/applications/reminders` | Legacy ATS, unreachable since UX-4. Removal is deferred cleanup package A. |

## Rules this map encodes

- **No route strands the user.** Every path either belongs to one of the six,
  redirects into one, or is deliberately unlinked.
- **Nav labels match H1s.** "Company Sources"/"Companies", "Scan History"/"Scan
  Jobs" and "Saved Searches"/per-company crawl config are all resolved.
- **Operational vocabulary stays under System.** Provider, connector, board,
  crawl, batch and ATS appear nowhere in Today, Opportunities, Applications, or
  above the fold on Companies.
