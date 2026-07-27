# DP-2.1 — ATS Provider Coverage Audit

Audit date: 2026-07-27  
Scope: public job discovery only. Candidate/application APIs are irrelevant unless they establish that job reads require authentication.  
Decision rule: a browser-visible career page is not, by itself, evidence that an undocumented JSON or GraphQL route is a supported integration contract.

## Certification definitions

- **SUPPORTED** — a vendor documents an unauthenticated employer-scoped job feed, or explicitly documents published jobs as public and third-party-readable.
- **LIMITED** — public jobs exist, but discovery requires an employer-enabled feed, a tenant-specific HTML adapter, or credentials supplied by the employer.
- **UNSUPPORTED** — no documented, unauthenticated, stable discovery contract was found.
- **DO NOT IMPLEMENT** — the only technically attractive route is undocumented or its use would require bypassing an access control or policy.

Robots certification is necessarily host-specific. Before enabling any board, Job Finder must fetch that exact host's `robots.txt`, fail closed on ambiguity or denial, identify itself, cache the decision, and apply conservative backoff. Vendor API documentation does not override a tenant's robots policy or contractual terms.

## Executive decision

The live connectors are concentrated in the safest part of the ecosystem.
**Personio was implemented in DP-2.2A and JobScore in DP-2.2B.** The strongest
next addition is an employer-authorized Teamtailor connector. **Teamtailor,
Breezy HR, Jobvite, Pinpoint, iCIMS, Oracle Recruiting Cloud, SAP
SuccessFactors, Dayforce, UKG, BambooHR, JazzHR, Rippling, and Zoho Recruit
should not be implemented as generic crawlers without a separately certified
public contract.** Workday's undocumented `/wday/cxs` route remains **DO NOT
IMPLEMENT**.

The recommended DP-2.2 sequence is:

1. DP-2.2A — Personio XML feed — **implemented**
2. DP-2.2B — JobScore JSON feed — **implemented**
3. DP-2.2C — Teamtailor employer-authorized API connector
4. DP-2.2D — Jobvite employer-provided feed connector
5. DP-2.2E — Pinpoint contract-validation spike; implement only if the vendor confirms the public feed contract

## Provider coverage matrix

Complexity includes discovery, normalization, pagination, deletion handling, tests, diagnostics, and board onboarding.

| Provider | Market position / primary segment | Public discovery evidence and board structure | Auth / paging / limits | IDs, URLs, deletion and duplicate quality | Certification | Complexity / risk | Priority |
|---|---|---|---|---|---|---|---|
| Greenhouse | Major modern ATS; technology and growth companies | Official Job Board API: `GET boards-api.greenhouse.io/v1/boards/{token}/jobs?content=true`; board token comes from hosted board URL | GET is unauthenticated; list is board-scoped and returned as one collection; vendor documents no GET rate ceiling | Numeric posting ID, `absolute_url`, offices/departments; absent posting means closed. Strong canonical stability; multi-location posts can resemble duplicates | **SUPPORTED — implemented** | Low; low regression risk. Board-token discovery remains the coverage constraint | P1/current |
| Lever | Major modern ATS; technology and growth companies | Official Postings API: `GET api[.eu].lever.co/v0/postings/{site}?mode=json`; vendor explicitly says published postings are public and may be scraped | GET unauthenticated; `skip`/`limit`; global and EU hosts; no published GET limit | Stable posting ID, `hostedUrl`, `applyUrl`; excellent duplicate key. Closed posts disappear / detail returns unavailable | **SUPPORTED — implemented** | Low; low risk. Must retain regional host | P1/current |
| Ashby | Fast-growing modern ATS; startups and technology companies | Official public posting endpoint: `GET api.ashbyhq.com/posting-api/job-board/{board}` | Unauthenticated; board response is a collection; compensation optional; no documented pagination | Posting ID plus `jobUrl`/`applyUrl`; listed flag; strong canonical quality | **SUPPORTED — implemented** | Low; low risk | P1/current |
| SmartRecruiters | Large global ATS; mid-market and enterprise | Official public Posting API: `GET api.smartrecruiters.com/v1/companies/{companyIdentifier}/postings` | Public company-scoped read; `limit`/offset behavior; destination must remain PUBLIC | UUID/ID and predictable hosted URL; detail fetch improves normalization; closed records leave public results | **SUPPORTED — implemented** | Low–Medium; version and pagination regression risk | P1/current |
| Workable | Broad SMB/mid-market ATS | Official endpoint returns public account jobs: `GET workable.com/api/accounts/{subdomain}?details=true` | Unauthenticated employer-scoped collection; no documented pagination on this public endpoint | `shortcode`, job/application/short URLs and publish date; strong duplicate key | **SUPPORTED — implemented** | Low; public endpoint has fewer guarantees than SPI v3, so monitor schema | P1/current |
| Recruitee | European/global SMB and mid-market ATS | Official Careers Site API: `GET {company}.recruitee.com/api/offers/`; documentation explicitly says no authorization | Unauthenticated; filters by department/tag; no documented paging contract | Offer ID/slug and `careers_url`; closed offers disappear; consistent tenant host | **SUPPORTED — implemented** | Low; documentation is marked work in progress | P1/current |
| Comeet | Mid-market collaborative recruiting ATS | Official Careers API: `GET comeet.co/careers-api/2.0/company/{uid}/positions?token=...` | Public-at-runtime company UID and token, but employer/admin must expose them; IP throttling is documented without a numeric threshold | Position UID and hosted URL; published records only; updates may lag by minutes | **SUPPORTED — implemented** | Medium; token onboarding and throttling require care | P2/current |
| Teamtailor | Strong European/mid-market ATS | Official jobs API exists, but API access uses an employer-issued key even for public-scope data; public career pages are tenant-hosted | Authentication required; JSON:API pagination is available to authorized clients | Strong IDs and URLs when authorized; no safe global board-token discovery contract established | **LIMITED** | Medium with employer consent; High as unsolicited discovery | P2 |
| Breezy HR | SMB ATS | Official positions endpoint exists, but documentation requires an Authorization header. Hosted career pages are public; no unauthenticated feed contract was found | API token required; position-state filtering; rate contract not established for public discovery | API model has ID, friendly ID, remote/location, department and description; public-page deletion semantics undocumented | **LIMITED** | Medium with employer token; High otherwise | P3 |
| Jobvite | Established mid-market/enterprise ATS | Vendor supports customer career sites and job feeds/integrations, but no generally available unauthenticated cross-tenant API contract was found | Employer/partner configuration required; feed paging and rate behavior depend on provisioned integration | Requisition IDs and hosted links are generally stable when a feed is provisioned; tenant variants raise regression risk | **LIMITED** | Medium with supplied feed; Very High for HTML estate | P2 |
| JobScore | SMB/mid-market ATS | Official public JSON/XML/JSONP feed: `careers.jobscore.com/jobs/{company}/feed.json` | No read authentication documented; vendor says poll no more than hourly and recommends daily; `limit`, department filter, sorting | Stable `id`, `detail_url`, `apply_url`, opened/updated dates; unpublished jobs excluded | **SUPPORTED — implemented** | Low; honor one-hour hard polling floor | P1/current |
| Pinpoint | Mid-market ATS | Public careers sites expose jobs and vendor material references careers integrations, but the audit found no authoritative unauthenticated feed specification defining stability, rate, or reuse | Public contract unverified; do not infer permission from frontend JSON | Tenant job identifiers/URLs appear usable, but deletion and schema guarantees are uncertified | **LIMITED — contract validation required** | Medium if confirmed; High otherwise | P2 spike |
| Personio | European SMB/mid-market HRIS/ATS | Official public XML career-site feed: `https://{company}.jobs.personio.de/xml?language=en` | Public employer-scoped XML feed; languages are explicit; each tenant is robots-certified | Numeric position ID; rich description blocks, office, department, employment type; canonical job URL follows Personio's documented `/job/{id}` format | **SUPPORTED — implemented** | Low–Medium; strict XML and deterministic single-locale parsing | P1/current |
| iCIMS | Major enterprise ATS | Public tenant career pages exist. Official platform APIs require establishing authentication; no universal unauthenticated jobs API contract was found | Authenticated API; highly configurable tenant pages and domains | Job IDs are usually stable, but URLs, HTML and search endpoints vary by tenant; high duplicate and regression risk across branded sites | **LIMITED** | Very High without an iCIMS-approved feed; Medium with one | P3 |
| Oracle Recruiting Cloud | Major global enterprise HCM | Oracle documents Recruiting Job Requisition REST resources, but examples require tenant credentials/Bearer access. Candidate career sites are public but their search transport is not certified as a public integration API | Authentication required for official APIs; tenant configuration and localization are extensive | Strong requisition IDs internally; public URL shape and withdrawn-job behavior vary by career site | **UNSUPPORTED** | Very High; high legal and regression risk for frontend reverse engineering | P4 |
| SAP SuccessFactors | Major global enterprise HCM | SAP documents OData `JobRequisition` / `JobRequisitionPosting`, but access requires API enablement, role and field permissions. No generic public job-feed contract was found | Authenticated OData; paging and fields are tenant/template-dependent | Strong requisition IDs inside authenticated API; public career-site links and schemas vary | **UNSUPPORTED** | Very High; tenant templates make normalization unstable | P4 |
| Dayforce | Major enterprise HCM | Public Dayforce career sites exist, but no vendor-documented unauthenticated job discovery API was found in the official developer material | Official integration access is tenant-authorized; public frontend transport is not a certified contract | Tenant/job identifiers exist, but URL/search/deletion behavior is not guaranteed for third-party use | **UNSUPPORTED** | Very High | P4 |
| UKG Recruiting | Major enterprise HCM | UKG documents platform integrations and recruiting workflows, not a generally available unauthenticated public jobs feed | Tenant credentials/authorization required for supported integrations | Tenant-specific public sites and product generations create unstable identifiers and normalization | **UNSUPPORTED** | Very High | P4 |
| BambooHR | Major SMB HRIS with ATS | Official ATS jobs endpoint requires an authenticated caller with ATS settings access; public careers pages do not establish a reusable feed contract | Basic/OAuth authentication and hiring scopes required | API provides job IDs and status when authorized; public URL and deletion behavior are not guaranteed | **LIMITED** | Medium with employer OAuth; High otherwise | P3 |
| JazzHR | SMB ATS | Public hosted apply pages exist, but no current vendor-documented unauthenticated job-feed contract was found | Supported API/feed access could not be certified without customer credentials | Public URLs are visible, but board enumeration, paging and withdrawn-job semantics are undocumented | **LIMITED** | High; HTML/tenant regression risk | P3 |
| Rippling Recruiting | SMB/mid-market HR platform | Public hosted job pages exist; no vendor-documented unauthenticated recruiting feed suitable for general discovery was found | Supported APIs require an authorized Rippling integration | Public identifiers and schema guarantees are unverified | **LIMITED** | High | P3 |
| Zoho Recruit | SMB/mid-market ATS | Zoho documents authenticated Recruit APIs and hosted career sites; no generally available unauthenticated cross-customer jobs API was certified | OAuth required for official APIs | IDs are stable inside the API; public career-site structure and deleted-job behavior vary | **LIMITED** | Medium with employer OAuth; High otherwise | P3 |
| Workday | Dominant enterprise HCM/ATS | Official tenant REST/SOAP access is authorized. The commonly observed career-site `/wday/cxs/...` route is undocumented and is already intentionally blocked in Job Finder | Official API authentication required; frontend endpoint has no supported rate/schema contract | Tenant/job paths can be stable but are not a contractual API; high regression exposure | **DO NOT IMPLEMENT** | Very High; unacceptable unsupported-endpoint risk | P4 |

### Additional significant ATS candidates

These should enter a later evidence-gathering queue, not DP-2.2: **ApplicantPro, ApplicantStack, CATS, ClearCompany, Fountain, Workstream, Homerun, Tellent/RecruitNow, and Avature**. They have meaningful segment presence or public career surfaces, but this audit did not locate enough primary-source evidence to certify an unauthenticated discovery contract. Their current certification is **UNSUPPORTED / unassessed**, not a claim that public jobs do not exist.

## Normalization matrix

Legend: **Y** documented/implemented, **P** partial or employer-configured, **N** absent from the public contract, **A** available only through authenticated API, **U** uncertified.

| Provider/feed | Company | Title | Location | Employment | Department | Description | Salary | Posting date | Job ID | Apply URL | Remote | Metadata |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Greenhouse | board | Y | Y | P | Y | Y | P | N | Y | Y | P | Y |
| Lever | board | Y | Y | Y | Y | Y | Y | Y | N | Y | Y | Y | P |
| Ashby | board | Y | Y | Y | Y | Y | Y | Y | P | Y | Y | Y | Y |
| SmartRecruiters | company ID | Y | Y | Y | Y | Y | Y | P | Y | Y | Y | Y | Y |
| Workable public account | account | Y | Y | Y | Y | Y | Y | P | Y | Y | Y | Y | P |
| Recruitee careers API | host | Y | Y | Y | Y | Y | Y | P | P | Y | Y | Y | P |
| Comeet careers API | Y | Y | Y | Y | Y | Y | Y | P | updated date | Y | Y | Y | Y |
| JobScore feed | Y | Y | Y | P | Y | Y | P/custom | Y | Y | Y | Y | P | Y |
| Personio XML | subcompany | Y | Y | Y | Y | Y | Y | N | P | Y | P | P | P |
| Teamtailor authorized API | Y | Y | Y | Y | Y | Y | P | Y | Y | Y | Y | Y |
| Breezy authorized API | Y | Y | Y | Y | Y | Y | P | P | Y | P | Y | Y |
| Enterprise/other limited group | P/A/U | Y | P | P | P | P | P | P | Y/P | P | P | P |

Primary normalization gaps:

- Company identity is usually board-scoped rather than repeated per job; onboarding must bind the board key to a reviewed company.
- Salary remains optional across nearly every feed.
- Greenhouse does not provide a standard posting date in the public Job Board response.
- Remote status is structured in Lever, Ashby and Workable, but often inferred from location/description elsewhere.
- Personio XML is multilingual and description-block based; it needs deterministic locale selection.
- Employer-configured metadata must never be assumed present.

## Discovery quality and operational controls

| Class | Duplicate likelihood | Deleted-job behavior | Board consistency | Maintenance burden |
|---|---|---|---|---|
| Documented public JSON feeds | Low when provider ID + board key is used; moderate for multi-location postings | Usually disappears or detail returns not found | High | Low |
| Documented XML feeds | Low with provider ID; locale variants must collapse | Disappears from feed | High–Medium | Low–Medium |
| Employer-authorized APIs/feeds | Low | Usually explicit status or disappearance | High within the authorized tenant | Medium onboarding burden |
| Public HTML career pages | Medium–High due localization, tracking URLs and duplicated location pages | Redirect, 404, stale cached page or removed search result | Low across tenants | High |
| Undocumented frontend JSON/GraphQL | Superficially low but schema keys are not contractual | Unspecified | Low | Very High; unacceptable for generic support |

Required connector controls:

1. Use `(provider, board key, provider job ID)` as the primary identity and canonical URL as a secondary identity.
2. Keep list and detail fixtures, schema guards, missing-field tests, withdrawn-job tests, pagination tests and rate-limit tests per provider.
3. Treat 401/403/robots denial as a provider warning or block, never as a reason to evade controls.
4. Respect `Retry-After`; otherwise use exponential backoff with jitter and an employer-level crawl budget.
5. Poll JobScore no more than hourly and default it to daily, matching vendor guidance.
6. Certify each exact production host and board key at onboarding.

## Legal and robots review

- **Lowest risk:** Greenhouse, Lever, Ashby, SmartRecruiters, Workable, Recruitee, JobScore and Personio because the vendor documents a public job-read/feed use case. Comeet is acceptable only when its public company UID/token was intentionally exposed by the employer.
- **Consent-bound:** Teamtailor, Breezy, Jobvite, BambooHR and Zoho are suitable only if the employer supplies credentials or a feed and its agreement permits this local use.
- **Do not reverse engineer:** Workday, Oracle, SAP, Dayforce and UKG frontend network calls are not substitutes for documented public APIs.
- A `robots.txt` allow is not a license, and a robots absence is not an endorsement. It is one required technical policy signal alongside vendor documentation, terms, rate behavior and the employer's publication intent.
- No connector may bypass CAPTCHA, authentication, bot mitigation, signed URLs, access tokens, or geographic controls.

## Priority ranking

### Priority 1 — highest confidence / lowest cost

- **Personio:** documented XML feed, stable position ID, rich normalization, employer-scoped URL.
- **JobScore:** documented JSON feed, explicit polling rules, stable IDs and canonical/apply links.

### Priority 2 — useful coverage with controlled onboarding

- **Teamtailor:** only as employer-authorized API access.
- **Jobvite:** only for an employer-provided feed.
- **Pinpoint:** first run a vendor-contract certification spike; do not ship from observed frontend behavior.
- Existing Comeet remains operationally Priority 2 because onboarding requires a company UID/token.

### Priority 3 — selective, employer-authorized integrations

- Breezy HR, BambooHR, JazzHR, Rippling Recruiting, Zoho Recruit and iCIMS.
- These are not generic discovery targets. Implement only when a documented feed/API is provisioned for a company cohort large enough to justify ongoing maintenance.

### Priority 4 — not recommended

- Workday, Oracle Recruiting Cloud, SAP SuccessFactors, Dayforce and UKG Recruiting.
- The public career experience is real, but the supported integration surface is authenticated, tenant-specific, or absent. Do not build generic crawlers around frontend internals.

## Gap analysis

There is no defensible public source for ATS market-share-weighted job coverage by endpoint, and the local company directory is not a representative labor-market sample. Therefore this audit does **not** invent a percentage of all jobs covered.

The auditable topology measure is:

- Requested providers audited: **23**
- Current practical public connectors: **9/23 (39.1% of audited provider types)**
- After consent-bound Priority 2 candidates: up to **12/23 (52.2%)**, but only for employers that authorize access or expose the certified feed

These are provider-type counts, not job-market coverage. Actual ecosystem coverage must be measured in a later sampling phase by taking a fixed, reviewed employer cohort, identifying each employer's ATS from its canonical careers URL, and reporting:

`public jobs reachable through certified connectors / all public jobs observed in the cohort`

Major remaining gaps after Priority 2:

- Enterprise HCM career sites: Workday, Oracle, SAP, Dayforce and UKG
- iCIMS' large but tenant-variable enterprise estate
- Long-tail SMB systems and bespoke company career sites
- Aggregators and general job boards, which are a different licensing and duplication problem from provider-first ATS discovery

## DP-2.2 implementation roadmap

### DP-2.2P — Discovery Platform consolidation

Status: **Certified.**

- Stable typed provider errors persist code, safe provider message, and context
- One capability-derived request/retry/polling/robots execution layer
- Auditable complete-feed and explicit-deletion reconciliation
- Universal nine-provider contract harness
- Dedicated contract documentation for every implemented public connector

### DP-2.2R — Public connector architecture review

Status: **Conditionally certified for existing public connectors.**

Identity propagation and exact per-employer robots targets were corrected
across the connector set. Authenticated-provider work remains gated on the
shared error, diagnostics, request-policy, deletion-reconciliation, and
contract-test refactors recorded in the
[architecture review](public-connector-architecture-review.md).

### DP-2.2A — Personio

Status: **Implemented.**

- XML parser with locale choice, account slug detection, position-ID identity and canonical URL verification
- Fixtures for description blocks, subcompanies, multiple offices, locale variants and deletion
- Per-tenant robots certification

### DP-2.2B — JobScore

Status: **Implemented.**

- JSON feed using daily default polling and an enforced one-hour minimum
- Strict schema validation, stable ID/canonical URL mapping, and removal detection
- Retry-After support plus bounded exponential backoff with jitter
- Per-board robots certification

### DP-2.2C — Teamtailor authorized mode

- Credential storage remains local; never infer or harvest keys
- JSON:API pagination, rate/backoff and permissions tests
- Connector is disabled until the employer/user supplies authorized access

### DP-2.2D — Jobvite feed mode

- Accept a reviewed employer-provided feed URL only
- Certify schema, canonical URLs, paging, rate policy and deletion semantics before enabling

### DP-2.2E — Pinpoint certification spike

- Obtain vendor confirmation or authoritative public-feed documentation
- Validate robots, stable schema, identifiers, URLs, pagination, rate limits and published-only behavior
- Exit with either a separately scoped implementation phase or **UNSUPPORTED**; no speculative adapter

## Evidence register

Repository evidence:

- `lib/job-sources/capabilities.ts` records current capability decisions.
- `lib/job-sources/providers/` contains the nine live public connectors and the deliberately blocked Workday adapter.
- `lib/job-sources/services/provider-discovery.ts` stops Workday before calling its undocumented route.
- `tests/job-sources.test.ts` and `tests/provider-discovery.test.ts` certify normalization, canonical URLs, duplicates, scheduled discovery and provider warnings.

Primary vendor evidence:

- [Greenhouse Job Board API](https://developers.greenhouse.io/job-board)
- [Lever Postings API](https://github.com/lever/postings-api)
- [Ashby Public Job Posting API](https://developers.ashbyhq.com/docs/public-job-posting-api)
- [SmartRecruiters Posting API](https://developers.smartrecruiters.com/docs/posting-api)
- [Workable public account jobs](https://workable.readme.io/reference/jobs-1)
- [Recruitee Careers Site API](https://docs.recruitee.com/reference/intro-to-careers-site-api)
- [Comeet Careers API](https://developers.comeet.com/reference/careers-api-overview)
- [JobScore Job Feed API](https://support.jobscore.com/hc/en-us/articles/202001320-Developers-Guide-to-Job-Feed-APIs)
- [Personio open-position XML feed](https://developer.personio.de/docs/retrieving-open-job-positions)
- [Teamtailor API authentication and public-data scope](https://docs.teamtailor.com/)
- [Breezy positions API](https://developer.breezy.hr/reference/company-positions)
- [BambooHR ATS job summaries](https://documentation.bamboohr.com/reference/get-job-summaries)
- [Zoho Recruit OAuth requirement](https://help.zoho.com/portal/en/kb/recruit/developer-guide/oauth-authentication/overview/articles/oauth-overview)
- [iCIMS API authentication requirement](https://developer-community.icims.com/faq/how-do-i-make-call)
- [Oracle Recruiting Job Requisitions REST API](https://docs.oracle.com/en/cloud/saas/human-resources/farws/api-recruiting-job-requisitions.html)
- [Oracle Fluid Recruiting authentication quick start](https://docs.oracle.com/en/cloud/saas/talent-acquisition/17.6/otrpi/Quick_Start.html)
- [SAP SuccessFactors JobRequisition OData permissions](https://help.sap.com/docs/successfactors-platform/sap-successfactors-api-reference-guide-odata-v2/jobrequisition)
- [SAP SuccessFactors JobRequisitionPosting permissions](https://help.sap.com/docs/successfactors-platform/sap-successfactors-api-reference-guide-odata-v2/jobrequisitionposting)

## Certification conclusion

Personio and JobScore are implemented. Proceed only with employer-authorized
systems through explicit credential/feed onboarding. Preserve the Workday
block. Re-audit vendor documentation and the exact tenant's robots policy
immediately before implementing or enabling any connector.
