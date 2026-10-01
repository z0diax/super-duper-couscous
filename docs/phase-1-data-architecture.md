# Phase 1: data architecture assessment

Observed from the repository and a read-only query of the configured local MariaDB database on 2026-09-30. This is an analysis and Phase 2 proposal; no production schema or application behavior was changed. The local measurements describe this installation, not a production baseline. File references below are relative to the repository root.

## 1. Current architecture

`DocumentDetailModal` (for example) calls `useApp().completeStep()` -> `AppContext.operation()` -> `stateApi.performAction()` -> `http.request()` -> browser `fetch()` of `api/state.php` -> `load_state()` in `api/store.php` -> PDO from `api/db.php` -> MariaDB. `fetch` sends same-origin session cookies and the CSRF header on POST. A GET follows `AppContext.refreshState()` -> `stateApi.loadAppState()` through the same HTTP and PHP path. `api/state.php` authenticates the session, begins a transaction, locks `app_meta` revision, reloads the user and full state, derives payroll progress, then filters the response through `filter_state_for_view()` before returning JSON.

For `completeStep`, `DocumentDetailModal.tsx:101` passes document ID, remarks, action, attachments, and optional next assignee. `AppContext` prepares file arguments through `api/files.php` if needed, sends the current revision, and accepts the returned state. `state.php` rejects stale revisions with 409, dispatches to `document_action()` in `domain.php`, persists changed collection records with `persist_state()`, inserts an `app_audit` event, increments revision, loads state a second time, filters it, commits, and responds. `document_action()` checks document visibility, historical and terminal status, current step, assignment and capability, required action and attachment, then marks the step completed, records actor and time, and activates/routes the next step. For a single payroll document it also updates its linked payroll item. `AppContext.accept()` replaces React state if the response revision is not older. On 401/409 it refreshes; on other errors it shows a toast. See `api/state.php:5-151`, `api/domain.php:441-607`, `api/store.php:21-44`, `src/context/AppContext.tsx:28-140`.

Authorization and business validation run on the server against full state. React capability checks mainly control presentation. Audit events are separate `app_audit` rows, while document custody and step history are embedded in the document JSON. Revision locking serializes GET and POST requests through `SELECT ... FOR UPDATE`; the POST body revision provides optimistic stale-client protection. This global lock can itself become contention under frequent polling.

## 2. Current database structure

`database/schema.sql` defines `app_records(collection,id,record_json,updated_at)` with `(collection,id)` primary key and JSON-validity check; `record_json` is `LONGTEXT`. The table has no extracted-field indexes. Separate tables: `app_users` (accounts/credentials), `app_audit` (sequence plus JSON event), `app_files` (file metadata and `owner_id`; bytes live in upload storage), `app_meta` (revision/schema version), `app_login_attempts`, `application_settings`, and legacy `app_state`. `api/store.php` reads `app_records`, `app_users`, and `app_audit`; it does not read `app_state`. The Laravel scaffold in `backend/` is not the active API. `api/leave.php` separately queries leave JSON with SQL JSON extraction.

## 3. Current collections

All 12 `COLLECTIONS` in `api/store.php:4` use `app_records`. â€œSearch/filterâ€ describes observed application use; â€œcandidateâ€ means eventual normalization only where targeted queries or integrity justify it.

| Collection | Purpose, key fields and relationships | Nested / repeated data | Search/filter; authority/routing; normalization |
|---|---|---|---|
| `documents` | Registry and workflow instance: tracking/barcode, type, status, template ID/version, current step, encoder | Steps, attachments, custody, hold/release details, actor snapshots; workflow settings copied from template | Header, registry and task queues search/filter often; document visibility and assignment depend on it. Strong candidate with child steps/files/custody. |
| `workflowTemplates` | Configurable routing by classification, document type(s), employment class, active/version | Step definitions, assignees, personnel pools, external settings | Workflow manager searches/filters; registration routing uses it. Strong candidate with versioned step rows. |
| `classifications` | Catalogue categories and allowed document types | `types[]` with SLA/active/workflow flag | Intake validation/filtering/routing; category and type rows are reasonable later candidates. |
| `payrollBatches` | Batch header, stage/desk, item/group IDs, release/progress | Workflow stages/history, attachments, actor/desk snapshots | Header/queues filter; batch visibility and routing. Later payroll phase candidate. |
| `payrollItems` | Batch or single-entry item, barcode, stage, classification, assignee | Audit history, compliance attachments; batch numbers repeated | Header/queue search and authorization. Later payroll phase candidate. |
| `workGroups` | Batch work grouped by employment class and processor/team | `itemIds[]`, audit history, processor snapshots | Queue and batch filters; group authorization. Later payroll phase candidate with group-item link. |
| `employmentRoutingRules` | Employment-class processor routing and SLA | Eligible processor ID pool and snapshots | Payroll routing; small but relational links could help integrity later. |
| `leaveApplications` | Leave lifecycle, employee, dates, barcode/status | Date ranges and action fields; employee/office snapshots | Leave views and `api/leave.php` SQL filtering; module-based visibility. Later leave phase candidate, especially date ranges. |
| `ewpRecords` | Encoded EWP barcode, employee, office, amount, purpose | Minimal nesting | Leave-area text search and module visibility. Small candidate only if targeted querying warrants. |
| `migrationSummaries` | V1 reconciliation counts/status by dataset | Flat | Admin display; no frequent operational lookup. JSON acceptable for now. Key can be `datasetName`, not `id`. |
| `systemRoles` | Role capabilities keyed by role ID | Flat capability flags | Authorization on every state action; relational roles/capabilities are possible, but changing them requires careful parity. |
| `assigneeDesignations` | Role/team labels and optional base role | Flat | Workflow configuration and routing UI; low volume, later candidate if referenced as durable IDs. |

`users` and `auditLogs` appear in frontend state but are **not** `app_records` collections. User role/profile snapshots are repeated inside documents, steps, batches, and audit entries; some are intentionally historical display names and should not be discarded when links are added. Source: `src/types.ts`, `api/store.php`, `api/domain.php`, `api/payroll.php`, `api/management.php`.

## 4. Storage analysis

Read-only results from the configured local database (InnoDB `table_rows` is approximate; allocated table pages include free space and do not equal JSON text size):

| Table | Approx. rows | Data KB | Index KB |
|---|---:|---:|---:|
| app_records | 331 | 1552 | 0 |
| app_audit | 695 | 400 | 48 |
| app_users | 16 | 32 | 16 |
| app_state | 1 | 32 | 0 |
| application_settings | 11 | 16 | 16 |
| app_files | 0 | 16 | 16 |
| app_meta | 1 | 16 | 0 |
| app_login_attempts | 10 | 16 | 0 |

| Collection | Records | JSON KB | Average bytes | Largest bytes |
|---|---:|---:|---:|---:|
| leaveApplications | 243 | 259.66 | 1094.21 | 1538 |
| documents | 29 | 116.89 | 4127.41 | 4221 |
| payrollItems | 61 | 106.88 | 1794.16 | 3453 |
| payrollBatches | 11 | 43.47 | 4046.36 | 4218 |
| workflowTemplates | 10 | 40.76 | 4173.60 | 6945 |
| workGroups | 13 | 12.65 | 996.15 | 1187 |
| classifications | 4 | 7.03 | 1800.25 | 3780 |
| systemRoles | 6 | 3.61 | 616.50 | 662 |
| ewpRecords | 8 | 2.89 | 369.38 | 385 |
| employmentRoutingRules | 3 | 1.34 | 456.00 | 467 |
| assigneeDesignations | 8 | 1.14 | 146.00 | 161 |
| migrationSummaries | 1 | 0.22 | 222.00 | 222 |

Repeat locally for a different environment or after the suite changes data:

```sql
SELECT table_name, table_rows,
 ROUND(data_length/1024,2) AS data_kb,
 ROUND(index_length/1024,2) AS index_kb,
 ROUND((data_length+index_length)/1024,2) AS total_kb
FROM information_schema.tables
WHERE table_schema=DATABASE()
ORDER BY data_length+index_length DESC;

SELECT collection, COUNT(*) AS records,
 ROUND(SUM(LENGTH(record_json))/1024,2) AS json_kb,
 ROUND(AVG(LENGTH(record_json)),2) AS avg_record_bytes,
 MAX(LENGTH(record_json)) AS largest_record_bytes
FROM app_records GROUP BY collection ORDER BY SUM(LENGTH(record_json)) DESC;
```

These figures alone do not establish inefficiency, including a roughly 1 MB database: the relevant cost is rows scanned and decoded per request, repeated reads, response bytes, PHP memory, lock duration, and client work. No request latency, network payload, peak memory, or production concurrency was measured here. Collect those before deciding how much to change.

## 5. `load_state()` analysis

`load_state()` issues three SELECTs: **all** `app_records` rows ordered by ID (including unknown collections, which it ignores after retrieval), all `app_users` ordered by name, and all `app_audit` ordered by descending sequence. It decodes known record JSON with depth 64 and `JSON_THROW_ON_ERROR`; audit JSON is decoded separately without throw mode; users are mapped to public profiles. It loads 12 operational collections, plus users and audit logs. Every GET calls it once. Every successful POST calls it before action and after persistence, then returns the filtered result. Failed POSTs may still have paid the initial load cost. All pages currently receive the full authorized state, even if displaying one module. Costs scale with total rows, JSON size, PHP arrays copied for `$before`, audit growth, and response serialization. `payroll_attach_batch_progress()` also traverses state on each load. Unknown collections still cost a row transfer but are not exposed in state.

## 6. Frontend refresh analysis

After `getSession()` confirms a user, `AppContext` immediately GETs state. A timer GETs every 5 seconds while authenticated, visible, and `busy.current` is false. Focus and online events trigger immediate GETs if not busy, even if the tab is hidden for the online event. A successful mutation accepts the POST response's entire state; it does **not** send a separate GET. A 401/409 mutation error triggers a GET. Logout clears state. `sessionGeneration` ignores results from a prior login; revision ordering ignores older revisions. There is no in-flight GET guard, cancellation, or request coalescing, so slow polling/focus requests can overlap. `busy` guards mutations and skips interval/focus refresh during a mutation.

At steady visible idle use with one tab per person and a 5-second timer, approximate GET rates are 12/min (1 user), 60/min (5), 240/min (20), and 600/min (50). Initial loads, focus/online events, mutations and additional tabs add requests; hidden tabs reduce timer GETs. Each GET currently acquires the global revision row lock and loads state before filtering.

## 7. Search analysis

`Header.tsx` first uses `.find()` for case-insensitive exact tracking number, document barcode/legacy ID, payroll item barcode, and batch number/barcode (or item batch ID). It then uses `.filter()` + `.some()` + `.includes()` for partial text across document identifiers/title/subject/source/sender/classification/type; batch number/barcode/office/type/period/liaison/remarks/encoder; and item barcode/title/office/classification. The nested `payrollItems.filter()` inside every batch loop scans items once per batch, so that portion is O(batches Ã— items), beyond the linear document and batch passes. `MyTasksQueue.tsx` filters documents by assignment/status and partial tracking/title/office/sender and batches by batch number/type/office. `DocumentRegistry.tsx` filters local documents by legacy/current, classification, status and priority. `WorkflowManager.tsx` searches template title/types/employment class/description. `LeaveContinuity.tsx` searches EWP barcode/employee/office/purpose/remarks. These searches require those authorized collections already in React; exact ID lookup does not fetch a missing record. The backend filters before returning state, so searching loaded state does not itself bypass authorization. Future targeted search must apply record-level authorization before returning hits and before direct-ID detail responses.

## 8. Authorization analysis

`authenticated_user()` validates session ID and credential against `app_users`; POST also checks CSRF. `has_cap()` resolves role capability from `systemRoles`, with administrator override. `filter_state_for_view()` applies record-level document/item/group/batch/leave/EWP filtering and audit filtering after action processing. Document visibility includes supervisor/admin, encoder, prior step completer or handoff owner, current assignee (person takes precedence over role, then team matching office/division), external handoff/return participants, and release-capable users for release-ready/released documents. Work group visibility includes supervisor/admin, assigned processor/team. Payroll item visibility also considers parent batch encoder/desk, release desk, item assignee, visible group, and release status; a single-entry item delegates to linked document visibility. Batch visibility can result from a visible item, but `scoped_payroll_batch()` removes unrelated item IDs, attachments, remarks, history and release details for limited group viewers. Leave visibility is supervisor/admin or enabled leave module (including null legacy module list); current leave rows are withheld from centralized state, while `api/leave.php` serves that module separately. EWP visibility uses admin/module scope. Audit events appear for the actor or visible record IDs. `api/files.php` uses `can_view_attachment_owner()`; keep the same owner semantics when normalizing.

`document_action()` independently checks visibility before ID-based actions and then checks assignment, capability, step/status, and special external handoff/return rules. This behavior, including 404 for an unauthorized document ID, must survive later APIs. Inspect and preserve comparable checks in payroll, leave, management, and file endpoints; client-side filtering is never the authority. Sources: `api/bootstrap.php`, `api/domain.php:16-153,441-607`, `api/files.php`, `api/leave.php`.

## 9. Workflow engine analysis

A **template** is a configurable `workflowTemplates` record: classification, document types, optional employment class, active flag, version, and ordered step definitions. `WorkflowManager` edits step order, assignments, SLA, required action, attachment/return/hold flags, personnel pools, and external handoff/return settings. `management_action()` validates changes and increments template `version` on update; deleting a referenced template is blocked. `resolve_workflow()` chooses one active matching template and rejects ambiguous matches. `register_document()` copies its steps into the document's `workflowSteps` **instance**, records template ID and version, and may complete an intake step immediately. This snapshot protects in-progress documents when a template changes, although old template versions are not preserved as separate template records.

An instance step carries assignee (role/team/person/system), status, current flag, SLA, start/completion times, actor, action, remarks, attachment references, return/hold settings, and external configuration/state. Assignment may resolve from template, a personnel pool at registration or transition, or employment routing for payroll. `document_action()` completes/returns/holds/rechecks/approves/releases according to step rules; external steps move through `PENDING_HANDOFF` -> `OUTSIDE_HRMDO` -> `COMPLETED`, recording handoff, return and custody entries. Required attachments use `app_files` metadata and document attachment arrays. The engine must remain data-configurable; fixed status replacement would lose routing and history semantics.

## 10. Main bottlenecks (expected impact, not measured ranking)

1. Full `load_state()` plus global revision row lock on every polling GET: total database reads, JSON decode, PHP memory and lock contention grow with all collections/audit history.
2. Full authorized-state JSON response every 5 seconds per visible tab: repeated network transfer, browser JSON parse and React replacement.
3. Successful POST loads full state twice and copies state for diff persistence; the second load also decodes all audit rows.
4. In-memory server visibility scans with cross-collection loops and frontend nested batch/item search; cost rises as records increase.
5. No indexes for extracted document/workflow fields inside JSON; future selective queries on the current layout need scans or generated/indexed columns.

This is a hypothesis ordered by likely scaling effect. Measure p50/p95 GET/POST latency, query counts/time, response bytes, PHP peak memory, rows and concurrent visible tabs before final prioritization.

## 11. Proposed normalized schema (review only)

| Proposed table (name provisional) | PK, key fields, relationships, source mapping |
|---|---|
| `documents` | `id` PK; tracking/barcode, title/subject, source, classification/type, priority/status, dates, encoder ID, template ID/version, current step number/location, legacy fields. From document scalar JSON. FK to users/template only after legacy/orphan audit. |
| `workflow_templates` | `id` PK; classification, title, description, version, active, employment class. From template header. Need immutable version history or snapshot preservation before updates replace current template. |
| `workflow_template_document_types` | `(template_id,document_type)` PK; supports `documentTypes[]` including `All`; FK to template. |
| `workflow_template_steps` | `(template_id,template_version,step_number)` PK or surrogate ID; stage, action, assignee, SLA, flags, pool/routing/external settings. From `steps[]`; versioned immutable definitions recommended. |
| `document_workflow_steps` | `(document_id,step_number)` PK; copied snapshot fields plus status/current, assignee, timestamps, actor, action, remarks, external status/details. FK document; optional reference to template step version. From `workflowSteps[]`. |
| `document_attachments` | `file_id` PK or `(document_id,file_id)`; document ID, step number, kind, display snapshot/upload time; FK to `app_files.id` and document when compatible. Map `attachments[]` and `complianceAttachments[]` without duplicate file rows. Keep file bytes and ownership semantics. |
| `document_custody_history` | `id` PK; document ID, movement, locations, time, step, actor, purpose/remarks/representative. From `custodyHistory[]`. |
| `document_remarks` | `id` PK; document ID, text, author/time. From runtime `remarks[]`. |
| `document_step_file_links` | `(document_id,step_number,file_id)` PK if step `supportingFileIds[]` needs separate queryability; avoid duplicating attachment metadata. |
| `audit_events` | Existing `app_audit` can be retained initially; eventual typed columns for sequence, actor, action, subject ID, time, tracking and details. Preserve all historical JSON/sequence during migration. |

Flexible infrequently queried external handoff/return details, release receipt fields, and legacy import metadata can remain JSON on their parent rows, provided fields used for authorization, routing or filtering are columns. Actor names and template step configuration must be retained as snapshots even when user/template FKs exist. Payroll-linked documents may need nullable FK/compatibility handling with future payroll tables.

## 12. Proposed indexes

For future tables: unique or audited nonunique `documents(tracking_number)` and `documents(barcode)` support exact Header lookup and uniqueness checks; determine case-insensitive collation and legacy duplicates first. `documents(status,current_step_number)` supports queues, while `(classification,document_type,status)` supports registry/routing views; verify selectivity before adding both. `(encoded_by_user_id,status)` supports encoder visibility. Workflow template `(classification,is_active,employment_classification)` and document-type link `(document_type,template_id)` support `resolve_workflow()`. Step `(assigned_user_id,status)`, `(assigned_role_id,status)`, `(assigned_team,status)` plus `(document_id,step_number)` support current assignment and step fetch; a current-step predicate or denormalized current-assignment projection may be needed because only one step is active. `document_attachments(document_id,step_number)` supports detail/file access; `document_custody_history(document_id,timestamp)` supports timeline. `audit_events(subject_id,sequence)` and `(actor_id,sequence)` support scoped history. Date indexes should follow measured date-range queries, not be added speculatively. Every extra index consumes pages, slows inserts/updates/backfill, and can worsen lock/write cost; review query plans and cardinality before committing.

## 13. Migration risks

Inventory malformed JSON (the current CHECK does not prove expected object shape), absent or duplicate nested IDs/step numbers, orphan template/user/file/payroll references, duplicate tracking/barcodes across collections and case variants, missing legacy IDs, and historical V1 document shapes. Template updates overwrite the latest template row while document instances retain snapshots, so backfill must use the instance as authority for in-flight work and retain its recorded version. Preserve current external handoff/return state, holds, returns, skipped steps, attachments including on-disk SHA-256 and owner mapping, custody history and `app_audit` sequence. Validate foreign-key compatibility with string widths/collation and intentionally historical users. Use deterministic mapping and idempotent backfill, count/hash/content comparisons, dual-read parity, backups and reversible read/write feature flags. Keep `app_records` intact throughout cutover and rollback.

## 14. Phase 2 recommendation

Start specifically with Documents + Workflow. First collect GET/POST payload, latency, peak memory and query timing under representative records/users. Then create reviewed additive tables and immutable template-version snapshots; write an idempotent backfill from `app_records` with exception reporting and no source deletion. Reconcile counts, IDs, steps, attachments, custody, statuses and sample end-to-end histories; add parity tests for visibility and transitions. Keep existing writes and reads on `app_records` while shadow reads compare normalized projections. Later, behind reversible flags, switch document/workflow reads and then writes, maintaining old storage during a monitored compatibility window. Retire old rows only under a separate approved plan after rollback is no longer needed. No Phase 2 implementation is included here.

## 15. Expected Phase 2 files

Likely new additive SQL migration(s) under `database/` or `scripts/`, backfill/verification scripts under `scripts/`, and integration tests under `tests/`. Likely later edits: `api/store.php`, `api/state.php`, `api/domain.php`, `api/management.php`, `api/files.php`, and eventually `src/services/stateApi.ts` and `src/context/AppContext.tsx` for targeted reads. `backend/` Laravel files are not the production migration target. Exact file scope should follow the approved design and measured bottleneck.

## 16. Tests

`npm run lint` (`tsc --noEmit`) passed. `npm test` ran 26 integration cases: 24 passed and 2 failed in the unchanged application. `single payroll follows configured workflow and synchronizes its item on release` expected 403 when an admin adds a remark to an assigned processor's document, but received 200 (`tests/integration.test.mjs:411`). `external handoff preserves custody, waits for return, and activates the next internal stage` expected 403 for an admin recording a return as another receiver, but received 200 (`tests/integration.test.mjs:583`). Both conflict with the explicit `canAdmin` override in `document_action()`; determine whether the tests or that override express the intended rule before Phase 2. The integration fixture creates and removes a separate `hrmdo_test_*` database and upload directory. No behavior was changed to satisfy it. UI/Playwright tests and production load tests were not run. The read-only SQL measurement above was separate from the test suite.

