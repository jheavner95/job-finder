# Greenhouse coverage and diagnostics

Job Finder does not perform a global MyGreenhouse search. Greenhouse's public
Job Board API is board-scoped, so discovery checks only locally registered,
enabled `CompanyConnector` records whose `atsType` is `greenhouse`.

The private board directory lives in local SQLite. No owner-specific companies
or board tokens belong in source control. The Sources page can add and test one
board, enable or disable it, or import a reviewed local JSON/CSV directory.
Duplicate provider/token pairs are rejected.

Each Greenhouse crawl stores the board outcome and structured diagnostics in
`ConnectorCrawl.metadata`. The record includes the total board inventory,
title and location match stages, every exclusion category, and a per-posting
reason with matched or excluded title terms. The Sources page exposes this as
the expandable “Why jobs were excluded” report.

The MyGreenhouse comparison form accepts public job URLs only. It extracts a
public company board token when possible, compares it with the local directory,
and reports covered, missing, or unresolved URLs. It never requests credentials
or automates authenticated browsing.
