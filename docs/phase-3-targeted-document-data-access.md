# Phase 3: targeted Documents + Workflow reads

`api/document_repository.php` is a PHP/PDO read module over the Phase 2 shadow tables. It is not an HTTP endpoint. `api/state.php`, `load_state()`, `app_records`, `AppContext`, search, polling and all production writes remain unchanged. Before any later cutover, normalized tables must be kept current; Phase 2 backfill is currently manual, so the repository can become stale after a production mutation.

## Repository architecture and functions

Callers must pass the server-authenticated user returned by `authenticated_user()`. The repository reads only one `systemRoles` row from `app_records` for that user's current capabilities. It never calls `load_state()`. It uses typed normalized document/step columns for SQL scoping and lists; a single `documents.source_json` snapshot is used for the final existing `can_view_document()` check on direct lookup. That check uses the targeted role state and document only.

| Function | Return |
|---|---|
| `document_repository_by_id`, `document_repository_by_tracking`, `document_repository_by_barcode` | One authorized document snapshot or `null`; unknown and unauthorized are indistinguishable. Nonunique identifiers are checked in date/ID order. |
| `document_repository_list` | Lightweight document headers plus page metadata, no workflow/attachment/custody JSON. |
| `document_repository_tasks` | Page of actionable current-step tasks with assignment context. |
| `document_repository_steps`, `document_repository_attachments`, `document_repository_custody` | Authorized child records for one document. |
| `document_repository_detail` | Parent snapshot with workflow steps, attachments and custody rebuilt from the normalized child tables. |
| `document_repository_template` | Current or specified version, with ordered template steps and document types. Existing document detail uses its own instance steps, never the current template steps. |

Direct lookups use prepared equality predicates on ID, tracking number or barcode. List and task queries use a count query and `LIMIT ? OFFSET ?`, returning `page`, `limit`, `total`, and `totalPages`. Default page size is 25; limit must be 1–100; page must be at least 1 and offset must fit a signed 32-bit integer. Invalid inputs throw `InvalidArgumentException`. List filters are whitelisted: status, classification, document type, priority, workflow template ID, current-step assigned user/role/team, and received-date bounds. Date bounds compare the stored ISO-like strings; mixed historical date formats should be audited before relying on chronological ranges. No generic SQL identifiers come from the caller.

## Authorization and queues

The SQL visibility predicate mirrors `can_view_document()` in `api/domain.php`: supervisor/admin capability; encoder; any step completer or handoff owner; current person, role or office/division team assignment (an assigned user takes precedence); external pending handoff owner/intake capability; outside return receiver/intake capability; and release-ready/released records for release capability. SQL scoping occurs before pagination and count, so hidden rows do not consume page slots or appear in totals. Direct lookups additionally call the unchanged `can_view_document()` on the one targeted source snapshot. Child functions authorize the parent first. A known ID, tracking number, barcode or file ID does not grant access. `api/files.php` still performs its existing owner check and is untouched.

The task query joins the current `document_workflow_steps` row and excludes legacy and terminal documents. It returns current person/role/team assignments, external handoff owner or return receiver according to external status, and the encoder of an on-hold document. A normal `System` assignment alone is not a task. This matches the actionable queue rules rather than treating all supervisor-visible documents as tasks. SQL produces compact rows; it does not load every workflow history. The existing UI still uses its current queue implementation.

## Local baseline and comparison

Measured on the configured local MariaDB database on 2026-09-30, with 29 normalized documents and 410 `app_records` rows. Baseline: a CLI script selected an admin, called `load_state()` plus `filter_state_for_view()`, then JSON encoded an approximate `state.php` body. Twenty runs gave a median 30.4 ms, p95 36.6 ms, about 662,314 response bytes and 12 MiB peak allocated PHP memory. This omits session/authentication, transaction/revision locking, payroll progress derivation, HTTP/network time and browser work; it is **not** observed HTTP latency. `load_state()` itself makes three broad SELECTs.

For a comparison, a separate warmed CLI process called each path 50 times. The table below reports median/p95 for PHP plus local database operations and JSON result bytes; the rows are from this installation only:

| Path | Median ms | p95 ms | Result JSON bytes |
|---|---:|---:|---:|
| Old `load_state()` + filter | 28.606 | 51.979 | 662,626 |
| Targeted by ID | 0.371 | 0.560 | 3,928 |
| Targeted detail with children | 0.965 | 1.310 | 3,928 |
| Targeted first page (25 rows) | 0.713 | 0.908 | 12,391 |
| Targeted admin task page (empty) | 1.037 | 1.277 | 57 |

In separate one-shot CLI processes, allocated peak memory was 6 MiB for old full state and 2 MiB for one targeted detail. By-ID does two SELECTs (role and document); detail adds three child SELECTs; list/tasks each do role, count and page SELECTs. These query counts exclude session and any later HTTP wrapper. The 29-document dataset is too small to predict production throughput. The architectural scaling difference is bounded page/detail transfer versus all operational records and audit history, but actual benefit needs representative load tests after a safe cutover plan.

## Query plans

`EXPLAIN` was run locally on representative prepared equality queries, a 25-row registry order, and the actual scoped task predicate for a non-admin user. InnoDB row estimates are approximate and plans can change as data grows.

| Query shape | Chosen key/access | Estimated rows and interpretation |
|---|---|---|
| Document by ID | `PRIMARY`, `const` | 1 |
| Tracking number | `idx_document_tracking`, `ref` | 1 |
| Barcode | `idx_document_barcode`, `ref` | 1 |
| Registry ordered by received date, limit 25 | no key, `ALL`, filesort | 29; table scan is reasonable at this size, but revisit a `(date_received,id)` index with larger data and real page plans. |
| Current assigned user, with step status equality | `idx_instance_status_user` then document `PRIMARY` | 1 step estimate + 1 parent lookup |
| Current assigned role, with step status equality | `idx_instance_status_role` then document `PRIMARY` | 1 + 1 |
| Current assigned team, with step status equality | `idx_instance_status_team` then document `PRIMARY` | 1 + 1 |
| Full scoped task query for one non-admin user | documents `idx_document_status_step` range, current step `PRIMARY` eq-ref, visibility subquery `PRIMARY` | 4 document rows, 1 current step, about 2 subquery step rows; filesort for final date order. |

No new index was added solely because one 29-row registry query sorts. The combined queue predicate includes several assignment alternatives; collect its plan and p95 latency at larger cardinality before choosing a specialized or union-based queue index/query.

## Tests and limitations

`tests/phase3-document-repository.test.mjs` uses an isolated database. It covers authorized, absent and hidden IDs; tracking/barcode lookup; first/later pages and invalid bounds; filters; person/role/team assignments; external return, intake and release visibility; queue results; attachment and custody reconstruction; and an instance at version 1 alongside a current template at version 3. Local parity was also checked for every user and document against `can_view_document()` with zero differences. `npm run lint` and the existing integration suite were run; the latter remains at the documented 24/26 baseline because two tests expect 403 where the existing admin override returns 200. This phase does not change that behavior.

The repository depends on a verified, refreshed Phase 2 shadow copy. It does not yet have automatic change propagation, transactionally synchronized reads, an HTTP API, or a production authentication boundary of its own. Child `source_json` snapshots preserve the original shapes; typed columns are deliberately a smaller query projection. No claim of production speedup or authorization cutover is made.

## Phase 4 recommendation

First establish reliable shadow freshness and parity checks across normal mutations. Then expose narrow authenticated endpoints for document list, detail and tasks, passing the server-authenticated user into this repository. Keep the existing `state.php` path during a reversible, monitored read rollout. Test authorization for direct identifiers and file access, and compare the full scoped query plans at production-like cardinality. Do not switch writes or React retrieval until those checks pass.
