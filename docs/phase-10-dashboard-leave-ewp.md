# Phase 10: Dashboard, Leave and EWP operational reads

## Scope and baseline

This phase leaves `app_records`, the existing write transaction, `state.php`, `load_state()`, and the visible five-second global poll in place. The flags are independently reversible and default off. The Phase 1–9 architecture documents were reviewed before editing. The current Dashboard has **no Payroll, Leave, EWP, chart or Work Group metric**: all four cards and its task/outside panels count visible current documents, and its activity panel shows the first four authorized `auditLogs`. Navigation links open Tasks, Registry, Leave, Audit or registration; they do not calculate additional data.

## Dashboard dependency and semantic audit

| Widget | Source fields and exact legacy meaning | Scope, window and navigation | Freshness |
| --- | --- | --- | --- |
| My Action Tasks / badge / pending panel | Current nonlegacy documents excluding Released, Archived, Disapproved, where `isDocumentActionableForUser(doc,user,true)`; count all, display rows in state ID order | `can_view_document` state scope; no date window; opens My Tasks or document Detail | B for dashboard; queue itself A |
| Active In-Flight | Current nonlegacy visible documents excluding Released, Archived, Disapproved | Same scope; no date window; Registry link | B |
| Pending Approval | Current nonlegacy visible documents with `Pending_Approval` status | Same scope; no date window; My Tasks link | B |
| Released / Concluded | Current nonlegacy visible documents with Released or Disapproved status; Archived excluded | Same scope; no date window; Registry link | B |
| Outside HRMDO | Current nonlegacy visible documents with Awaiting_External_Return; count all and show first five by state ID | Same scope; no date window; Detail link | B |
| Recent Document Events | First four events in state audit sequence order whose actor is the user or whose subject is visible | Existing `filter_state_for_view` scope; no date window; Audit link | B |
| Signed-in identity and quick links | `currentUser`, module permissions, tabs | Session/bootstrap; user click | C |

Every document metric has a count numerator and no denominator. No Payroll metric exists in this Dashboard; Payroll task and shell counts belong to My Tasks, Header and Sidebar. `api/dashboard.php` reuses document visibility and actionable SQL predicates, plus Payroll scope predicates solely for audit-subject authorization. It returns six aggregate counts, at most 25 task rows, five outside rows and four audit rows. It does not send source documents to React for counting. The task row limit is a display bound; the count remains complete. Actor-owned events retain legacy visibility. For other events, the subject must currently be visible as a document, full Payroll batch, item, visible Work Group in a visible batch, Leave or EWP record. Single Payroll items use the linked visible document. This check is at least as strict as the state filter. No hidden subject identifier is returned in the compact activity DTO.

`VITE_DASHBOARD_TARGETED_READS=1` selects this contract; `HRMDO_DASHBOARD_TARGETED_READS_ENABLED=1` gates it server-side. The frontend loads on entry, focus/visibility return, local `stateRevision` changes and a visible 30-second interval, with a retry control. This keeps the reporting view reasonably current while operational queues retain their existing targeted five-second refresh. Dashboard links still target the same screens. With the Detail flag on, task and outside rows open the targeted document ID.

## Leave and EWP audit

Leave source is `app_records.leaveApplications`; `api/leave.php` already provided filtered, sorted server pages of 10/25/50, summary counts, task count, and office/type metadata. It now reads one role record for capabilities instead of calling `load_state()` on each Leave request. The existing statuses and filters are unchanged. The list row still supports edit, status change, delete and detail. `api/leave_detail.php` reads one exact current ID; `api/leave_audit.php` returns 10 events per page, newest sequence first. Those replace Leave detail's dependence on the whole audit array. They use the same admin/supervisor or Leave module authorization as the legacy state filter; hidden IDs return 403/404 without a record. The UI preserves its existing action eligibility and write methods. In targeted mode Leave refreshes on entry, focus, visible 15-second interval and local revision; detail/history refresh on revision.

EWP source is `app_records.ewpRecords`. The prior screen filtered all visible rows client-side over barcode, employee, office, purpose and remarks, sorted by `createdAt` descending, counted all records, summed assistance and counted distinct offices. It has no separate detail screen or workflow state; list rows contain edit/delete actions and the existing registration form. `api/ewp.php` now performs the same search server-side, returns 10 rows/page (maximum 100), and calculates global totals separately from the filtered page. It reads only the indexed `collection='ewpRecords'` range of `app_records`, with no new projection or write path. The production sample observed in Phase 1 had eight EWP records; the 10,000-row fixture still returned a ~3.4 KB page in about 0.2 seconds locally. A dedicated projection and its transactional maintenance are not justified by this evidence. Authorization is admin or Leave module, matching `can_view_ewp_records`; EWP has no per-owner read restriction in existing semantics. The UI refreshes on entry, focus, visible 15-second interval and local revision, and has retry and page controls. Edits/deletes/registration continue through existing state actions.

`VITE_LEAVE_EWP_TARGETED_READS=1` enables the new Leave detail/history and EWP page in React; `HRMDO_LEAVE_EWP_TARGETED_READS_ENABLED=1` gates their APIs. The existing Leave list API is already targeted even with this flag off. All endpoints require a session, validate IDs/query/page sizes, and do not call `load_state()`. A browser failure does not silently fall back to stale whole-state operational rows.

## Configuration, forms and the remaining consumer matrix

The `users`, roles, designations, classifications, workflow templates and employment routing rules in AppContext are reference data for names, eligibility, dropdowns and draft forms. Dashboard uses current user only. Leave uses current user permissions, fixed leave types and office options from the existing targeted list/user reference. EWP uses current user and the office options. Register Document and Register Payroll use classifications/templates, users and existing documents for option display and early duplicate checks; Payroll routing and Document Detail use users/rules for processor selection. The server remains authoritative for duplicate barcodes, permissions, workflow and revision checks. These references need bootstrap/screen-entry and post-configuration-write refresh, perhaps focus refresh, rather than a five-second whole-state fetch. A stale option can produce a rejected write; it cannot authorize one. No configuration migration was made.

The matrix was compiled from all `useApp` consumers under `src/components` and AppContext. “Targeted” describes the all-flags-on read path, not the still-running compatibility poll.

| Feature | Whole-state collections still referenced | Purpose / class | Targeted path and consequence without the five-second poll |
| --- | --- | --- | --- |
| Document Registry, Detail and single Payroll voucher | Documents, audit, Payroll item, users, routing rules | A operational; C/D for users/rules | Registry/Detail APIs and linked single Payroll item are targeted. Detail forms retain C/D reference options; cross-user rule changes wait for bootstrap/focus or a later configuration refresh. |
| My Tasks and held work | Documents, Payroll batches/items/groups, users/rules | A plus C/D | Document/Payroll task and held APIs own live membership. Processor options are C/D; stale options may be rejected by server. |
| Header search/notifications and Sidebar badges | Documents, Payroll batches/items/groups, users/current user | A plus C | Search/shell APIs provide live results; user identity and permissions remain session/reference data. |
| Payroll Management and batch/Work Group detail | Batches/items/groups, documents, users/rules | A plus C/D | Paged Payroll APIs and detail own operational state; dormant legacy admin tabs and forms retain reference collections. |
| Dashboard | Documents, audit, current user | B plus C | Compact Dashboard API on entry/focus/revision and visible 30-second interval; reporting counts can lag up to that interval. |
| Leave and EWP | Leave, EWP, audit, current user | A plus C/D | Leave list/detail/history and EWP page refresh visibly every 15 seconds; existing writes retain revision transaction. |
| Audit Report and migration/archive views | Audit, documents, migration summaries | B | Still whole-state/reporting; slower or focus-only poll delays report updates. |
| Users Dashboard | Users, documents, roles, designations | B/C/D | Personnel list/report, editing and early assignment checks still use bootstrap state; cross-user changes lag. |
| Workflow Manager and configuration modals | Templates, classifications, roles, designations, users, routing rules | C/D | Configuration editing and dropdowns still use bootstrap state; cross-user changes lag and server revision checks prevent overwrite. |
| Register Document/Payroll and detail action forms | Templates, classifications, users, rules, sometimes documents | D | UI options and early duplicate checks can age; backend validation and revision remain authoritative. |
| AppContext mutation coordinator | All collections and global revision | D | Every write still posts to `state.php`; response refreshes state. Cross-user updates to the revision currently arrive through the global poll or a 409-triggered full refresh. |

**Operational read conclusion:** the named everyday screens have independent targeted read paths with all flags on. **Polling cutover conclusion:** the application is not yet fully independent of full-state polling for smooth cross-user writes. The shared mutation revision is updated by `state.php`, not by targeted responses. Without periodic state refresh, a user may see fresh targeted records but submit an old global revision, receive 409, reload the whole state and retry. Reporting/configuration views also remain whole-state consumers. A reversible revision/bootstrap strategy and remaining report/configuration freshness work must precede removal of routine global polling. This phase does not change it.

## Detail reload investigation and browser configurations

The older Detail timeout was not reproduced under a matched build: the delayed-response reload test passed once with trace enabled and five further repeats. AppContext persists the targeted ID in workspace location, restores it after authentication and the Detail effect refetches on ID/revision; no API error or missing modal was observed. The known reproducible test failure is an environment mismatch: a targeted Detail build with the test runner's `VITE_DOCUMENT_DETAIL_TARGETED_READS` unset produced a Registry assertion expecting zero requests while the browser made one. This is a test-runner/build mismatch, not evidence of an app defect. The prior isolated timeout has no trace that proves a narrower root cause, so it remains a historical flake rather than a claimed fix. Keep the reload test in the matched build gate and retain traces on future failure.

Build flags are read by Vite at build time; Playwright's `process.env` must match the build. Server fixtures must enable corresponding `HRMDO_*_ENABLED` gates. Use these explicit configurations:

| Configuration | Frontend flags | Browser gate |
| --- | --- | --- |
| Default legacy | All `VITE_*_TARGETED_READS=0` | Current legacy smoke; do not run targeted specs |
| Document targeted | Registry, Detail, Tasks, Search, Shell = 1; Payroll/Dashboard/Leave-EWP = 0 | Registry and Detail targeted specs; set matching test-runner env and document backend gate |
| Payroll targeted | Payroll = 1 with needed Document flags | Payroll targeted spec; set runner env and Payroll backend gate |
| Fully targeted operational | All eight flags = 1 | Phase 10 operational smoke, Registry, Detail and Payroll; all three backend gates |

The legacy `app.spec.ts` still contains stale labels (`Operational Overview`) and fixed September 2026 calendar dates; those two focused cases failed on the current default build. The default legacy `failed saves` case passed. Their assertion drift is separate from this migration. The previous broad sweep classification in Phase 9 remains the baseline; this phase did not rewrite unrelated UI expectations.

## Representative load and plans

`scripts/benchmark_phase10_operational.mjs` uses one disposable MariaDB fixture, one processor, 100/1,000/10,000 Documents, Leave, EWP and audit records, and 100/1,000/1,000 Payroll items respectively. Three localhost HTTP samples per read give medians. Runs alongside other test processes varied materially, so times are illustrative. `scripts/phase10_query_plans.php` records the query plans. Memory was not reliable across separate PHP requests and is not claimed.

| Records per Document/Leave/EWP/audit collection | Whole state bytes / ms | Dashboard bytes / ms | EWP page bytes / ms | EWP search ms | Leave page bytes / ms | Leave exact ms | Leave audit page ms |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 100 | 269,842 / 43 | 7,010 / 51 | 3,341 / 15 | 25 | 3,774 / 17 | 10 | 11 |
| 1,000 | 2,632,818 / 178 | 7,013 / 62 | 3,367 / 34 | 48 | 3,817 / 41 | 10 | 13 |
| 10,000 | 19,847,279 / 5,205 | 7,016 / 334 | 3,371 / 186 | 379 | 3,853 / 300 | 11 | 46 |

The 10,000-row plan uses a scan of `documents` for Dashboard aggregates, the `app_audit` sequence primary key for recent activity, the `app_records(collection,id)` primary key range for EWP and Leave lists, and an exact primary-key lookup for Leave detail. EWP created-at order uses filesort; substring search and Leave filters scan only their collection range. Leave audit filters JSON `documentId` over the sequence index. These scans are a measured scaling limit, especially for heavy search and history; the data does not yet justify another transactionally maintained projection or several write indexes. Reassess at real EWP/Leave scale and usage. The linked single Payroll item query scans `payroll_read_items` by `document_id` because no index exists; it is one rare Detail lookup. Add an index only if measured latency warrants it.

The realistic active-user comparison on that same 10,000-row fixture was one document shell, Payroll shell, document tasks, Payroll tasks, Registry page, one Detail and Dashboard: **7 requests, 109,486 transferred bytes, ~1,790 ms sum of per-endpoint medians**. One `state.php` response was **19,847,279 bytes, ~8,086 ms** in that run. The targeted path uses more requests and avoids transferring entire collections; these sequential median sums are not browser page-load latency, since real requests overlap and are not all requested on every view. The 8,086 ms state result differs from the table run due to local load variation. No production latency guarantee follows from these fixtures.

## Polling options, rollback and recommendation

| Option | Operational / cross-user freshness | Configuration freshness | Network/server cost | Risk / rollback |
| --- | --- | --- | --- | --- |
| 1. Keep five-second state poll | Current immediate compatibility; targeted A screens also refresh | Five seconds | Highest repeated full-state bytes/decoding | Lowest change risk; no rollback |
| 2. Slow state poll to 30–60 seconds | Targeted A screens stay 5/15 seconds, but shared mutation revision and legacy views lag | 30–60 seconds | Lower whole-state load | Stale-revision retries increase; restore five seconds easily |
| 3. Focus/online/post-mutation state plus targeted resource refresh | A reads stay current while visible; cross-user write revision can lag until 409 | Focus/write only | Low idle whole-state cost | Needs revision handling and explicit reference refresh; restore timer |
| 4. Remove routine state poll, bootstrap/configuration separately | A reads independent; revision must use a separate lightweight path or conflict strategy | Explicit session/config refresh | Lowest recurring full-state cost | Highest implementation/testing risk; restore flag/timer |

Rollback Phase 10 by rebuilding with `VITE_DASHBOARD_TARGETED_READS=0` and `VITE_LEAVE_EWP_TARGETED_READS=0`, then disable their backend gates after clients switch. The existing Leave list and write path remain. No new table is introduced. Phase 11 should first design a lightweight revision/bootstrap and configuration refresh path, prove cross-user mutation behavior without a routine whole-state poll, and only then trial option 2 or 3 behind a reversible flag. Option 4 needs a later gate after report/configuration consumers are addressed. No polling change was made here.

## Verification

TypeScript lint, PHP syntax and production builds passed. Phase 2–10 targeted API tests passed (13/13), including Dashboard metric parity, bounded EWP/Leave reads, audit scope and linked single Payroll item. Integration remains 24/26 with the two pre-existing administrator-override expectation failures. Focused Detail reload passed 6/6; matched Registry+Payroll targeted browser cases passed 4/4; fully targeted Phase 10 Dashboard/Leave/EWP smoke passed 1/1. The default legacy `app.spec.ts` focused checks had two passes and two known stale assertion failures. Read-only Document and Payroll projection verification both returned `status: ok` with no issues. This phase adds no projection.
