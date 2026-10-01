# Phase 7: targeted My Tasks and whole-state dependency audit

## Scope and compatibility checklist

The authoritative write path remains `AppContext` → `state.php` → `app_records` → transactional normalized projection → revision/audit. The five-second `state.php` poll, focus and online refreshes, and full-state processing after writes remain in place. Registry and Detail flags stay independent of the new task flag.

The legacy queue in `MyTasksQueue.tsx` derives six document tabs from the server-scoped `AppContext.documents` array. It also displays payroll batches and held payroll items from `payrollBatches`, `payrollItems`, `workGroups`, and `employmentRoutingRules`; their actions stay on `state.php`. Source order is the `app_records ORDER BY id` order from `load_state()`; the UI performs no further sort. The classification filter is exact, and search is a case-insensitive substring of tracking number, title, source office, or sender name. There is no SLA, due-time, or overdue column. The row opens `DocumentDetailModal`, and Team Queue offers Claim.

Before the change, `document_tasks.php` represented a single generic active task query. It included Team assignments in that result and sorted by received date descending. It did not represent the six screen tabs, tab counts, the screen's filters, or its ID-ascending order. Phase 7 retains that no-queue behavior for earlier API consumers and adds explicit whitelisted queue modes for the screen.

Compatibility checklist:

| Concern | Existing behavior retained in targeted mode |
|---|---|
| Six document tabs and count badges | Yes; queue counts are unfiltered as in the legacy UI, while page totals follow filters. |
| Person, Role, Team, System | Person and Role are in My Tasks; Team is in Team Queue until claimed; System alone is not actionable. A user ID on an assignment takes precedence over its Role/Team type. |
| Current step | Match `currentStepNumber` to the workflow step; My Tasks and Team Queue require that step. |
| Returned, hold, recheck, release, concluded | Preserve the exact tab predicates described below. |
| External handoff and return | Pending handoff belongs to its handoff owner; while outside, actionability moves to the configured return receiver. |
| Payroll | Normalized Payroll documents remain eligible for document tabs; batch payroll cards and held payroll items remain on the existing full-state path. |
| Filters, order, opening, actions | Server-side document filter/page in targeted mode; ID ascending; targeted Detail by ID when enabled, otherwise legacy modal; writes remain on `state.php`. |
| Errors and races | Explicit loading, empty, no-match, error/retry states; request generation prevents an older page/filter/revision response from replacing a newer one. |

## Assignment and workflow state semantics

All queues first use the same record visibility as `state.php`, derived from the authenticated session user, server-side role capability record, assignment, participation, encoder, and release capability. The endpoint rejects `userId` and every unknown query parameter. An administrator can *see* all authorized documents but does not gain a task assignment merely from administrator status.

| Queue | Legacy predicate reproduced by targeted query |
|---|---|
| My Tasks | Nonlegacy, nonterminal document with a current step; current Person/Role actionability, external handoff owner or return receiver, or an `On_Hold` document encoded by the user. Team assignment by membership alone does not appear here. |
| Team Queue | Nonlegacy, nonterminal current Team assignment (or outside external return receiver of type Team) actionable with Team membership. Claimed Team assignments remain here if their type stays Team. |
| Returned / Rework | Every visible nonlegacy `Returned` document, whether currently assigned to the viewer or not. |
| Waiting / Tracked | Visible nonlegacy, nonterminal document encoded by the user or previously completed by the user, provided it is not currently actionable with Team membership included. A missing current step is allowed, as in the legacy predicate. |
| Ready for Release | Every visible nonlegacy `Ready_For_Release` document. |
| Released / Concluded | Every visible nonlegacy `Released` or `Disapproved` document. |

`Pending_Approval`, `In_Progress`, `On_Hold`, `Ready_For_Recheck`, and external statuses can appear in My Tasks when the assignment predicate permits. `Released`, `Archived`, and `Disapproved` never appear in active task tabs. A handoff in `PENDING_HANDOFF` is actionable by its owner; after `recordExternalHandoff`, it is actionable by the return receiver; after `recordExternalReturn`, the next workflow step decides membership. Existing final release and return behavior is unchanged.

## Frontend rollout and API

`VITE_DOCUMENT_TASKS_TARGETED_READS=0` by default. Set it to `1` at build time and set the server's `HRMDO_DOCUMENT_TARGETED_READS_ENABLED=1` after the Phase 2 backfill and verification. The three frontend flags for Registry, Detail, and Tasks are independent. For rollback, build with the task flag `0`; no data migration reversal is needed. The server switch disables all targeted document reads and should remain `1` if Registry or Detail is still enabled.

`listMyDocumentTasks()` uses the existing HTTP helper and returns typed compact rows, pagination, and six unfiltered queue counts. Query parameters are limited to `queue`, `classification`, `search`, `page`, and `limit`. Page defaults to 1 and limit to 25, with a maximum of 100. Classification is whitelisted; search escapes SQL wildcard characters and covers the four existing document fields, preserving typed spaces as the old substring filter did. All tabs use stable document ID ascending order. The UI resets to page 1 on tab, classification, search, and page-size changes, and clamps a page if a mutation reduces the result count.

When both Tasks and Detail are targeted, opening a non-Payroll row calls `openTargetedDocument(id)` and fetches Detail by ID. When targeted Detail is off, the row resolves the full document from `AppContext.documents`, with an explicit error if it is absent. Payroll document detail remains on the legacy path. Claim and every other task mutation remain `AppContext` operations on `state.php`; the committed revision triggers an immediate task query refresh. The existing Detail and Registry revision refreshes continue independently.

## Whole-state dependency matrix

The poll is active every five seconds while the authenticated app is visible, plus focus and online refreshes. It loads and decodes all `app_records`, users, and audit records before filtering for the viewer. A targeted screen does not remove the other consumers listed here.

| Feature | Whole-state collections currently used | Freshness need | Targeted read available | Polling dependency |
|---|---|---|---|---|
| Document Registry | Documents for legacy mode and fallback Detail | High after writes; moderate otherwise | Registry and Detail | Still indirect through fallback and global consumers |
| Document Detail | Selected document, audit in legacy mode | High while open and after writes | Detail and scoped audit | None for targeted non-Payroll Detail itself; legacy and Payroll remain |
| My Tasks | Documents in legacy mode; payroll batches/items/groups/routing rules in both modes | High for active assignment; payroll also operational | Six targeted document queues | Payroll segment and legacy fallback still depend on whole state |
| Header and global search | Documents, payroll batches/items/groups, selected work | High for notifications and task counts; search can tolerate user-triggered refresh | None | Direct, on every page |
| Sidebar badge | Documents and payroll batches/items/groups | High for task badges | None for merged badge | Direct, on every page; its Team-inclusive count differs from My Tasks tab |
| Dashboard | Documents and audit logs | Moderate to high for operational summaries | None | Direct |
| Workflow Manager | Workflow templates, users, roles, designations and routing context | Usually low; refresh after configuration writes | Targeted template read exists, screen still uses state | Direct |
| Payroll Management | Payroll batches/items/groups, documents for single vouchers, routing rules | High during processing | No complete targeted Payroll API | Direct |
| Leave | Targeted leave registry plus audit logs and state writes | Moderate after writes | Leave registry query | Audit and EWP/state parts remain |
| EWP | EWP records | Moderate after writes | No targeted EWP read | Direct |
| Work Groups | Payroll groups/items/batches, users | High during processing | No complete targeted read | Direct |
| Classifications/configuration | Classifications, workflow templates | Low except after changes | Template read only | Direct |
| Users/roles/designations | Users, system roles, designations, documents for assignment counts | Low to moderate except after changes | No screen-wide targeted read | Direct |
| Audit report | Audit logs and documents | Moderate | Scoped document audit only | Direct |
| Registration forms | Documents for duplicate barcodes; templates, categories, users | High at submit; low while idle | No complete targeted form data | Direct |

**Phase 8 update:** The Header/Sidebar document rows above describe the Phase 7 baseline. [Phase 8](phase-8-targeted-shell-search.md) now provides independent targeted document search and one shared notification/count summary. With Search, Shell summary, and Detail flags on, those shell document features do not need `AppContext.documents`; their Payroll and shared user/configuration dependencies remain. The Dashboard, Payroll, Work Groups, audit, registration, configuration, and other rows above still block changing the global poll. The poll remains at five seconds.

## Polling and load measurements

Measurements are local observations, not service-level predictions. `scripts/measure_phase7_local.php` runs the same load, payroll derivation, visibility filtering, and response serialization as an administrator GET, without HTTP/session overhead or the revision lock. On the current local database it found 33 visible documents, 447 `app_records`, 797 audit rows, 18 users, and 133 normalized workflow steps. `load_state()` performs three source queries (`app_records`, `app_users`, `app_audit`), reads 1,262 rows, and JSON-decodes 1,244 record/audit values; it does not load the 133 normalized steps. Across five samples, median `load_state()` was 56.1 ms, median processing plus serialization was 70.4 ms, approximate uncompressed response was **759,080 bytes**, and PHP peak memory was 12 MiB. This is an administrator-scope approximation; other users' response sizes differ. `state.php` itself also incurs authentication, transaction locking, HTTP, and transfer time. An unfiltered targeted queue makes one role-capability query, one aggregate-count query, and one page query after authentication; a filtered page adds a matching-total query.

At one request per five seconds, the baseline is 12 requests/minute/user. The estimates below multiply the measured 759,080-byte body and exclude response headers, focus/online refreshes, mutations, retransmissions, compression, and server processing. Concurrent users may have different visibility scopes.

| Active users | Requests/minute | Body bytes/minute | Body bytes/hour | MiB/hour |
|---:|---:|---:|---:|---:|
| 1 | 12 | 9,108,960 | 546,537,600 | 521.2 |
| 5 | 60 | 45,544,800 | 2,732,688,000 | 2,606.1 |
| 20 | 240 | 182,179,200 | 10,930,752,000 | 10,424.4 |
| 50 | 600 | 455,448,000 | 27,326,880,000 | 26,060.9 |

The isolated load probe (`node scripts/benchmark_phase7_tasks.mjs`) creates a disposable `hrmdo_test_*` database, seeds three workflow steps per document, measures three samples per scale, prints query plans, and deletes the database afterward. Its default 128 MiB PHP limit could not complete `load_state()` at 10,000 documents. The reported 10,000-row run used 512 MiB for both CLI and test HTTP server. The seeded dataset does not include a large audit history, so it understates one real source of whole-state growth. HTTP values use the same processor identity and dataset for state and task reads; they include local request overhead and uncompressed body bytes. Read timings vary between runs.

| Documents / steps | PHP `load_state()` median | Targeted task query median | State HTTP body | Task HTTP body | State HTTP median | Task HTTP median |
|---:|---:|---:|---:|---:|---:|---:|
| 100 / 300 | 9.23 ms | 11.98 ms | 163,375 B | 18,980 B | 49.56 ms | 39.33 ms |
| 1,000 / 3,000 | 74.46 ms | 44.68 ms | 1,562,577 B | 18,984 B | 139.21 ms | 105.41 ms |
| 10,000 / 30,000 | 890.94 ms | 513.89 ms | 15,572,579 B | 18,988 B | 1,561.6 ms | 534.73 ms |

The targeted task query computes all six badge counts and returns only a 25-row page; the whole-state path decodes all source records and audit rows and serializes the viewer's state. At 10,000 documents, the task query's CLI process stayed at 4 MiB of allocated PHP memory before/after the query, while `load_state()` reached 200 MiB after decoding. These are PHP allocator readings from a process that seeded data first, not isolated per-request peaks. Network bytes are not server processing cost. The task query still grows with dataset size because counts and visibility must inspect authorized records. Combined badge aggregation reduced its 10,000-document median from roughly 1.16 seconds to 0.51 seconds in this fixture.

### Query plans and indexes

At 10,000 documents, `EXPLAIN` for the full queue page used `documents.PRIMARY` to preserve ID order, `document_workflow_steps.PRIMARY` as an `eq_ref` lookup for the current step, and a dependent visibility subquery on the step primary key. Standalone Person/Role/Team assignment probes scanned all 30,000 steps: the existing `idx_instance_status_user`, `idx_instance_status_role`, and `idx_instance_status_team` start with step `status`, while these probes filter assignment and `is_current` without step status. Those indexes therefore do not serve such standalone predicates. The measured full queue uses the document and step primary keys instead. No additive index is introduced in Phase 7: an assignment-first index would add write/storage cost without evidence that this full queue query would choose it. Recheck the plan if a future task API starts from assignment columns or badge queries change shape.

## Verification, rollback, and Phase 8 decision

`tests/phase7-tasks.test.mjs` compares complete IDs on every page across six queues for administrator, Person, Role, Team, restricted, and multiple-mode users; covers Pending, In Progress, Returned, On Hold, Ready for Recheck, Ready for Release, Released, Disapproved, System, external pending and outside, Payroll, and historical exclusion; checks filters, counts, ordering, limits, identity rejection, and anonymous access; and exercises complete, reassign, hold/compliance/recheck, and external handoff/return writes. `tests/ui/tasks-rollout.spec.ts` checks flag OFF and ON builds, loading, pages, filters, stale replies, empty, error/retry, and Detail ON/OFF integration.

The current local backfill verification completed with no drift issues: 33/33 documents, 133/133 document workflow steps, and 65/65 custody movements. TypeScript lint, PHP syntax, and all eight Phase 2–7 targeted Node tests pass. Browser checks pass in the intended flag builds: three legacy-mode checks, five with Tasks ON/Detail OFF, and nine with Tasks, Registry, and Detail ON. The full integration suite remains at its established 24/26 baseline; the two administrator-override assertions still fail and are outside Phase 7.

Rollback is a frontend rebuild with `VITE_DOCUMENT_TASKS_TARGETED_READS=0`. Keep the backend flag enabled when Registry or Detail needs it. The generic no-queue task endpoint remains available, so earlier API consumers retain their behavior. Phase 8 should first address always-mounted Header and Sidebar notification/count/search dependencies, Dashboard and Payroll freshness, and registration duplicate validation with resource-specific reads or revision notices; then measure conditional or slower polling against those consumers. Do not reduce or remove the global poll solely because the document task queue is targeted.
