# Phase 5: Document Registry targeted list rollout

## Before and compatibility checklist

Before Phase 5, `DocumentRegistry.tsx` read `AppContext.documents`, which came from `state.php` and `load_state()`. It excluded Payroll documents, filtered the full visible array by historical/current dataset, classification, status and priority, and displayed every matching row without pages or local search. The order came from `app_records ORDER BY id`; the Registry did not add its own sort. Its tabs showed counts across all non-Payroll visible documents. Columns were tracking/date, title/subject, office/sender, classification/type/employment class, current phase/name/location, and action. Clicking a row opened `DocumentDetailModal` via `AppContext.selectedDocument`; admin delete and registration used existing state actions. CSV exported all filtered rows. The modal consumes full document data plus AppContext audit, payroll, users and actions.

| Existing behavior | Phase 5 result |
|---|---|
| Visibility and Payroll exclusion | Server applies existing repository scope and `registry=1` Payroll exclusion. API parity test compares visible IDs for admin, processor (Person, Role, Team), and restricted user. |
| Dataset tabs and counts | Server filters `isLegacyV1` and returns scoped all/current/historical/outside counts. Missing legacy flag is treated as current, matching JavaScript's `!doc.isLegacyV1`. |
| Classification, status, priority | Whitelisted SQL filters; changing one resets to page 1. |
| Sort | Registry queries order by ID ascending to match the old source order. |
| Displayed fields | Compact rows include subject, employment class, total/current phase, current step name and location. Child history is excluded from list rows. |
| No local search | Still no Registry search. Global Header search remains on AppContext. |
| Open/detail, actions | Existing full-state modal and `state.php` mutations remain. The list row uses its ID to find the authorized full document already in AppContext. If unavailable, it shows an error and does not substitute another record. |
| CSV | A scoped server CSV response exports all filtered records without fetching all list pages into React. |
| Empty, loading and errors | Separate no-documents/no-matches messages, explicit loading, safe error and Retry. |

## New list flow and configuration

When the frontend is built with `VITE_DOCUMENT_REGISTRY_TARGETED_READS=1`, the Registry calls `listRegistryDocuments()` in `src/services/documentApi.ts`. It uses the shared `http.request()` endpoint construction and same-origin session credentials. The request reaches `GET /api/documents.php?registry=1&page=1&limit=25`; the Phase 3 repository queries the normalized projection. `registry=1` excludes Payroll and adds tab counts. The backend also needs `HRMDO_DOCUMENT_TARGETED_READS_ENABLED=1` in the PHP process. Backfill and `php scripts/backfill_documents_workflow.php --verify` must pass before either flag is enabled.

The frontend flag defaults to `0` in `.env.example` and is fixed at **build time**. For a targeted deployment, set both flags to `1` and rebuild/redeploy the frontend. To restore legacy Registry reads, set `VITE_DOCUMENT_REGISTRY_TARGETED_READS=0` and rebuild/redeploy. The PHP flag can remain on for other read clients, or be disabled separately. No database rollback is needed. If the targeted server returns 401, 403, 404, 503 or a network failure, the Registry shows an error and never silently switches to legacy list data.

The service defines typed list/page/count rows and optional ID, tracking-number and barcode detail helpers for future work. Detail helpers are **not used** by the Registry in Phase 5. `GET /api/document_registry_export.php` accepts only `registry=1`, `isLegacyV1`, `classification`, `status`, and `priority`; it applies the same session, feature flag, visibility and filter logic and streams CSV. Formula-like cell values are prefixed before export.

## Pagination, filtering and refresh

The Registry requests one page at a time: 25 rows by default, with 50 and 100 options. It shows total records, page number and total pages; Previous/Next stop at boundaries. Filter or page-size changes reset to page 1. If deletion makes the current page invalid, the Registry requests the new last page. Tabs retain their prior meanings, including Outside HRMDO selecting current records with `Awaiting_External_Return` status. The API uses whitelisted parameters and bound values; clients cannot supply SQL fields or ordering.

A request identity prevents an older response from replacing a newer page/filter result. Rows are cleared while a different request loads. API failures show a generic message with Retry, without raw backend errors. The page refetches when AppContext's revision changes, including after a successful `state.php` mutation and when polling detects another user's change. Register, delete and modal actions still use `state.php`; the synchronized projection is queried again after its revision advances.

Document detail is **not migrated**. The existing modal depends on the full `DocumentRecord`, AppContext audit history and mutation functions. This avoids a partial detail cutover with inconsistent post-mutation refresh. The Registry list itself renders from targeted compact rows; opening a row still depends on the authorized document in AppContext. This is a deliberate remaining dependency.

## Tests and measurements

`tests/phase5-registry-api.test.mjs` compares the complete paginated targeted ID sequence and equivalent filtered IDs with legacy state for administrator, processor and restricted users. Its processor records exercise Person, Role and Team assignments. It checks scoped counts, malformed filters and authorized CSV export. `tests/ui/registry-targeted.spec.ts` covers loading, rows, pagination, filter reset/query parameters, empty/no-match states, safe error/retry, delayed-response race, and opening the existing detail modal. `tests/ui/registry-legacy.spec.ts` verifies the disabled build displays AppContext documents without a targeted request. Phase 2–4 tests remain in the validation suite.

The isolated three-document fixture sampled each endpoint five times over local HTTP:

| Request | Records | JSON bytes | Median wall time |
|---|---:|---:|---:|
| `state.php` | 3 documents plus other state | 18,310 | 14.29 ms |
| `documents.php?registry=1&page=1&limit=25` | 3 compact rows | 1,939 | 31.59 ms |

These timings include local PHP test-server overhead and have high variance. They show a smaller Registry response in this fixture, **not** a proven latency improvement. AppContext still loads state on sign-in, every five seconds while the visible tab is idle, and on focus/online events; mutations still return full state. Thus Phase 5 does not reduce the global whole-state polling cost or remove `load_state()`. The small registry table still has no new index; its scan/filesort findings from Phase 3 are not a reason alone to add one.

## Phase 6 recommendation

After observing this rollout with representative data and confirming list/detail freshness, migrate the document detail read as its own controlled step. Preserve `state.php` writes and account for the modal's audit, payroll, attachment and post-mutation dependencies. My Tasks, dashboard, global Header search, Workflow Manager and polling remain outside Phase 5.
