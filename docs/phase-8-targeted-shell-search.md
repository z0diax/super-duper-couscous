# Phase 8: targeted shell search and document summaries

## Boundary and legacy audit

Header and Sidebar are always mounted. Both previously derived document behavior from the complete `AppContext.documents` array delivered by five-second `state.php` polling. The same components also use Payroll batches, items, groups, user identity, capabilities, and navigation state. Those collections and the global poll remain in place.

| Shell feature | Legacy collections and fields | Freshness / scope | Targeted replacement |
|---|---|---|---|
| Header search | Documents: tracking number, barcode, legacy ID, title, subject, source office, sender, classification, document type, status, location, ID. Payroll: batches and items, including offices, type, period, liaison, remarks, encoder, status | On submit; only viewer-visible state records | Authenticated `document_search.php`; Payroll still searches AppContext |
| Header notifications and unread badge | Nonlegacy documents: status, encoder, current step, assignment, hold reason/time, tracking number, title; Payroll batches/items/groups; local read IDs | Current assignments; record visibility; up to 25 combined entries | Authenticated `document_shell_summary.php` for compact document entries; existing Payroll derivation and local read IDs remain |
| Sidebar My Tasks badge | Active documents, including legacy V1: status, encoder, current assignment with Team membership; Payroll batches/items/groups and release desk | Current assignments; viewer scope | Same shared summary endpoint for document count; Payroll count remains legacy |
| Other Sidebar entries | Active tab, capabilities, configured sidebar modules | Configuration changes | Existing AppContext |
| Opening a document | Full document from state | Viewer-authorized selected record | Targeted Detail by ID when Detail flag is on; existing state lookup when off |

There are no separate Sidebar badges for Team Queue, released, recheck, or hold. The sole badge is the merged document plus Payroll task count on My Tasks & Queues. The Header unread badge counts unread entries among the **displayed 25**, with read IDs in user workspace storage. These are derived attention items, not stored notification records or audit events.

The Header document predicate excludes `isLegacyV1` and terminal `Released`, `Archived`, and `Disapproved` records. It includes a held document encoded by the user, or a document actionable for that user with Team membership included. Its message uses the hold reason for encoder compliance and otherwise the current step name or title. Timestamp preference is `heldAt`, current step `startedAt`, then `dateEncoded`. The Sidebar count uses the same active/actionable predicate **but includes legacy V1**. This differs from the Phase 7 My Tasks queue, so its count cannot be reused. Both continue to merge independent Payroll attention logic.

## Search semantics and implementation

The original Header searches **only on form submission**. It trims and lowercases the input. An empty value does nothing. It first finds one exact document by tracking number, barcode, or legacy ID in state source order; that document opens immediately and wins over an exact Payroll match. If no document matches, an exact Payroll item barcode opens its batch, or an exact batch number/barcode opens that batch. Otherwise it filters documents by case-insensitive substring across the nine fields in the matrix, and filters Payroll batches and items across their existing fields. Combined partial results sort by reference using JavaScript `localeCompare`, show the first 100, and report the full matching total. A record appears once even when several of its fields match. Search has no per-keystroke requests or debounce need.

The new endpoint searches normalized `documents`, never `app_records` JSON or all documents in memory. An exact candidate union uses tracking, barcode, and legacy ID indexes, preserves source ID ordering, and applies the repository's authoritative record visibility condition before returning a row. If no authorized exact document exists, the server counts and returns at most 100 authorized partial document rows across a fixed whitelist of nine columns. SQL wildcards in user input are escaped; queries are prepared and limited to 150 characters without control characters. The frontend merges the bounded document rows with unchanged Payroll results, sorts them, and displays at most 100. The small metadata row contains only fields needed by the Header. The existing ID-based Detail read supplies the full document when Detail mode is on.

The search API fails closed: an unauthorized exact ID is indistinguishable from no authorized exact match; unauthorized partial records never reach the browser. The UI shows a generic error and Retry on failure. It never falls back to state documents after an API error. A monotonically increasing request ID prevents a delayed old response from replacing a newer one or reopening a closed result panel. Exact and partial selection open Detail by ID with the independent Detail flag; with Detail off, the existing scoped state document lookup is used. Search and Detail flags can therefore roll out independently. Database collation and JavaScript `localeCompare` may order unusual mixed-case or accented references differently at the 100-row boundary; ordinary fixture references matched.

## Shared shell summary and refresh

`document_shell_summary.php` is one authenticated read for Header and Sidebar. It returns one Team-inclusive active document count and at most 25 compact, nonlegacy document notification entries. It applies the same repository visibility rule as other targeted reads and the current assignment predicates. The frontend combines those entries with existing Payroll notifications, sorts by timestamp, and keeps the first 25. Sidebar adds its unchanged Payroll task count to the returned document count. The summary contains no full document JSON or audit records.

`useDocumentShellSummary` is mounted once in `MainLayout` and passed to both components, avoiding duplicate shell requests. It loads on authentication, refreshes when the committed AppContext revision changes after an operation, polls every five seconds while visible, and refreshes on focus, online, and visibility return. It does not change the global five-second state poll. Overlapping requests within the same hook are suppressed. On a summary failure the UI shows a retry affordance and unavailable indicator instead of silently presenting a complete-looking document count. The search request is user-driven and does not poll.

`VITE_DOCUMENT_SEARCH_TARGETED_READS=0` and `VITE_DOCUMENT_SHELL_TARGETED_READS=0` are independent build-time defaults. The existing `VITE_DOCUMENT_DETAIL_TARGETED_READS`, Registry, and Tasks flags remain independent. The backend requires `HRMDO_DOCUMENT_TARGETED_READS_ENABLED=1` for these reads. The desired Registry/Detail/Tasks ON with Search/Shell OFF configuration and the all-ON configuration are both supported. To roll back one feature, rebuild with its flag `0`; leave the backend flag on if any other targeted document read remains active. No write path or data rollback is involved. The installer adds `idx_document_legacy_id` idempotently to existing normalized databases.

## Parity, security, and load evidence

`tests/phase8-shell-api.test.mjs` compares legacy state-derived search IDs, notification IDs/text/timestamps, and Sidebar count against targeted responses for administrator, Person, Role, Team, restricted, and multiple-assignment users. It includes legacy V1, held, terminal, external handoff/return, and hidden documents. It checks unauthorized exact and partial lookups, nonexistent and SQL-like terms, wildcard escaping, malformed/long queries, unsupported parameters, and unauthenticated access. Browser tests exercise both flag states, exact and partial selection, idle typing, no results, generic errors and Retry, stale responses, notifications, and count parity.

The disposable `hrmdo_test_*` scale probe (`npx tsx scripts/benchmark_phase8_shell.mjs`) uses the same processor and 100/1,000/10,000 seeded three-step documents for state and targeted HTTP reads, with three samples and the median reported. PHP memory was raised to 512 MiB so the 10,000-row whole-state request could finish. These are local fixture observations, not production predictions. HTTP timings include local request overhead and varied between runs.

| Documents | State body / median | Summary body / median | Exact tracking | Exact barcode | Common partial | Uncommon partial |
|---:|---:|---:|---:|---:|---:|---:|
| 100 | 163,375 B / 26.72 ms | 7,283 B / 24.75 ms | 258 B / 13.72 ms | 258 B / 14.24 ms | 22,828 B / 22.68 ms | 262 B / 25.72 ms |
| 1,000 | 1,562,577 B / 101.93 ms | 7,284 B / 99.50 ms | 258 B / 13.47 ms | 258 B / 16.03 ms | 22,829 B / 44.12 ms | 262 B / 41.78 ms |
| 10,000 | 15,572,579 B / 812.33 ms | 7,285 B / 631.35 ms | 258 B / 17.86 ms | 258 B / 13.79 ms | 22,830 B / 260.63 ms | 262 B / 545.12 ms |

The common term matches every seeded title but returns only 100 rows; the uncommon term matches one document through `%substring%`. `EXPLAIN` selects `idx_document_tracking`, `idx_document_barcode`, and newly added `idx_document_legacy_id` as `ref` exact lookups. Partial `LOWER(column) LIKE '%term%'` scans documents; a conventional B-tree cannot satisfy arbitrary substrings. The exact summary count also scans authorized active documents and joins the current step; its timing still grows substantially at 10,000 rows. This phase favors exact parity and a bounded response over changing search semantics or introducing full text infrastructure.

The probe also times the legacy Header/Sidebar document attention derivation **after** parsing the state body, using the existing `isDocumentActionableForUser` helper and the seeded processor: 0.19 ms at 100, 5.74 ms at 1,000, and 31.58 ms at 10,000. Those figures exclude state transfer and JSON parsing; they do not include Payroll work. The complete legacy path incurs the state body and read timings in the table plus that client work. The separate derivation run overlapped other local activity, so its HTTP timings were higher than the table's isolated indexed run; the numbers should not be treated as production latency.

## Whole-state dependency update and Phase 9

With Search, Shell summary, and Detail targeted flags ON, **Header and Sidebar document-specific features no longer require `AppContext.documents`**. The legacy branches remain available behind flags. Header still reads Payroll batches/items/groups, current user, capabilities, settings, and operation/navigation functions; Sidebar still reads Payroll, user, capabilities, and navigation. The `AppContext.documents` collection and `state.php` global poll remain unchanged.

| Feature | Remaining full-state dependency after Phase 8 | Polling blocker |
|---|---|---|
| Header/Sidebar document features | None with all relevant flags ON | No direct document dependency; Payroll and shared user/config data remain |
| My Tasks | Payroll batches/items/groups/routing; legacy mode or Detail fallback | Yes |
| Registry/Detail | Legacy mode, Payroll vouchers, or Detail fallback | Yes when those modes are active |
| Dashboard | Documents and audit logs | Yes |
| Payroll and Work Groups | Batches, items, groups, documents/vouchers, users, routing | Yes |
| Leave and EWP | Leave registry is targeted, but audit/EWP/state operations remain | Yes |
| Workflow Manager/configuration | Templates, roles, designations, categories, users | Yes |
| Users and audit reports | Users, roles, documents for assignment counts; audit logs/documents | Yes |
| Registration/forms | Templates, categories, users, documents for duplicate checks | Yes |

Phase 9 should inventory and migrate or explicitly retain these remaining consumers, especially Dashboard, Payroll, registration validation, users, and audit. Only after that should it measure a slower, conditional, or removed whole-state poll. Phase 8 does not alter the poll interval, authoritative `app_records` writes, `load_state()`, or Payroll normalization.
