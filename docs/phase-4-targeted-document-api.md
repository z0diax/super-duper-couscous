# Phase 4: transactional shadow synchronization and targeted read API

`app_records` remains authoritative. `state.php` still loads and persists centralized state and is the production read/write path for React. Phase 4 synchronizes Documents + Workflow shadow tables during normal application writes and adds optional authenticated read endpoints. No frontend screen, polling loop, business transition, revision rule, file download rule, or authorization override was changed.

## Mutation matrix

All listed `state.php` actions reach the same `persist_state()` boundary. It compares before/after collections, so changes made indirectly by management and payroll actions are also included.

| Action family | Authoritative change | Shadow projection affected |
|---|---|---|
| `registerDocument`, `registerSinglePayroll` | New `documents` JSON; potentially linked payroll item | `documents`, instance steps, attachments, initial custody |
| `claimTask`, `reassignTask` | Current document step assignment | Document snapshot and instance steps |
| `completeStep`, `returnStep`, `approveDocument` | Step/current position, status, completion/return metadata; a single payroll item may also change | Document snapshot and instance steps |
| `releaseDocument` | Final status, release receipt, custody | Document snapshot, instance steps, custody |
| `addDocumentRemark` | Embedded remarks | Document snapshot (`source_json`); no separate remark table exists |
| `uploadSupportingFile` | File relationship after `files.php` created `app_files` metadata | Document snapshot and attachment relationships; disk file is not copied |
| `placeDocumentHold`, `submitDocumentCompliance`, `recheckDocumentHold` | Hold/compliance state, optional attachments, step status | Document snapshot, instance steps, attachment relationships |
| `recordExternalHandoff`, `recordExternalReturn` | External step state/payload, status/location, files, custody | Document snapshot, instance steps, attachments, custody |
| `deleteDocument` | Removes document JSON, linked single-payroll item and owned file metadata | Removes normalized document and its child rows in the same transaction |
| `createWorkflowTemplate`, `updateWorkflowTemplate`, deactivate | Current template JSON/version/active state | Versioned template row, document-type links and template steps; older versions retained |
| `deleteWorkflowTemplate` | Removes unused current template JSON | Marks all shadow versions noncurrent; historical versions/steps retained |
| Catalogue type rename, role rename | May rewrite template type/step references and increment version | Same template version projection, detected from before/after diff |
| User/profile, payroll and other actions | May have no document/template change | No document shadow write unless their before/after state actually changed Documents + Workflow |

`files.php` upload alone creates an unowned `app_files` row but does not modify a document. The later document action binds that file and synchronizes the relationship. CLI restore and direct SQL do not call `persist_state()`; run the Phase 2 backfill/verification procedure after those operations before enabling targeted reads.

## Synchronization and transaction guarantee

The mapping lives once in `api/document_projection.php`, shared by `scripts/backfill_documents_workflow.php` and runtime synchronization. `persist_state()` in `api/store.php` records changed/deleted document and template IDs while writing `app_records`, projects only changed records, then writes their normalized rows. Unchanged documents and templates are not reprojected. The installer creates the additive shadow schema for fresh installations. Existing databases need a one-time `--apply` backfill before enabling reads.

`api/state.php` already begins a transaction and locks `app_meta` revision before dispatch. `persist_state()` now requires that transaction for document/template changes and performs source and shadow writes before audit insertion/revision increment/commit. A shadow SQL failure throws, causing `state.php` to roll back `app_records`, shadow rows, file ownership changes, audit and revision together. It does not create a nested transaction. The isolated fault-injection test installs a failing trigger on a shadow step insert, confirms HTTP failure, unchanged revision and absent source document, then removes the trigger.

Template update inserts a new `(id,version)` and clears previous `is_current` markers. Deactivation is a normal new version with `is_active=0`. Deletion of an unused template clears its current marker but preserves its historical versions and children. Document deletion removes the normalized document and children. `app_records` remains the only authoritative write model.

## Drift verification and local result

`php scripts/backfill_documents_workflow.php --verify` is read-only. It reports missing/extra current rows and compares counts, IDs, projected columns, complete JSON snapshots/hashes, current step, status, assignment, attachment and custody data. `--check` validates source without writes; `--apply` is the explicit repair/backfill mode. Verification was run after each representative application mutation in the Phase 4 test. It reported no discrepancies. The configured local database had gained one document since Phase 2; after `--apply`, a separate `--verify` reported:

| Projection | Source | Shadow |
|---|---:|---:|
| Documents | 30 | 30 |
| Current templates | 10 | 10 |
| Template types | 10 | 10 |
| Template steps | 55 | 55 |
| Document steps | 121 | 121 |
| Attachment relationships | 0 | 0 |
| Custody movements | 59 | 59 |

The local dataset still has no document attachment relationships; the isolated Phase 4 test uploaded a file and verified both normal and compliance links to its single `app_files` row. Runtime writes after this backfill stay synchronized through `persist_state()`. Direct database edits and restore remain exceptions that require explicit reconciliation.

## Targeted HTTP API

Set `HRMDO_DOCUMENT_TARGETED_READS_ENABLED=1` for the PHP process **after** successful backfill and `--verify`. The default is disabled. With the flag off, targeted endpoints return 503; existing `state.php` remains available. All endpoints are GET-only, use `bootstrap.php` session authentication, return JSON, and reject unsupported query parameters. GET follows the existing no-CSRF-token read policy; no targeted mutation endpoint was added. `InvalidArgumentException` from pagination/filter validation becomes HTTP 400. Current bootstrap behavior returns a generic HTTP 503 for unexpected server failures without exposing SQL details.

| Endpoint | Parameters | Response/access |
|---|---|---|
| `GET /api/documents.php` | `page`, `limit` (default 25, max 100), `status`, `classification`, `documentType`, `priority`, `workflowTemplateId`, `assignedUser`, `assignedRole`, `assignedTeam`, `dateFrom`, `dateTo` | Compact authorized document rows and pagination. |
| `GET /api/documents.php` | Exactly one of `id`, `trackingNumber`, `barcode` | Reconstructed authorized document detail. Unknown and unauthorized both return 404. |
| `GET /api/document_tasks.php` | `page`, `limit` | Compact current tasks for the **session user**; a supplied user ID is rejected. |
| `GET /api/workflow_templates.php` | `page`, `limit`, or `id` with optional positive `version` | Current template headers or one version with ordered steps and types. Requires `canAdmin`; other authenticated users receive 403. |

The repository applies SQL record scope before list/count pagination. Direct document lookup also applies the existing `can_view_document()` check to the targeted record. Session identity and current role capabilities come from existing backend mechanisms; file downloads continue to use `api/files.php` owner checks. The admin override remains exactly as implemented in `api/domain.php`.

Example list shape:

```json
{"data":[{"id":"doc-example","tracking_number":"TRACK-001","status":"In_Progress"}],"pagination":{"page":1,"limit":25,"total":1,"totalPages":1}}
```

Example detail shape: `{"data":{"id":"doc-example","workflowSteps":[...],"attachments":[],"custodyHistory":[]}}`. Errors retain the existing `{"error":"..."}` format. HTTP 401 applies to unauthenticated GETs, 400 to malformed parameters, 403 to the admin-only template route, 404 to missing/concealed documents, 405 to non-GET methods, and 503 when targeted reads are disabled or an unexpected backend failure occurs.

## Query plan and performance

The 29-row registry query examined in Phase 3 used a scan/filesort. No index was added: that plan is reasonable for a tiny table, and representative larger-data evidence is still needed. Phase 3's warmed CLI measurements were about 663 KB for full state versus 3.9 KB for one targeted detail, with medians about 28.6 ms versus 1.0 ms. Those are not HTTP timings.

An isolated PHP test server with three documents produced this **separate** five-request HTTP sample (median wall time includes local HTTP and PHP server overhead):

| Request | JSON bytes | Median ms |
|---|---:|---:|
| `state.php` | 18,072 | 29.2 |
| Targeted detail | 1,457 | 22.16 |
| Targeted 25-row list | 1,505 | 20.72 |

The fixture is small and serial. These numbers establish response shape and a test-environment sample, not production speedup or concurrency behavior.

## Tests, rollback and limits

`tests/phase4-shadow-api.test.mjs` covers registration; claim, complete, return and reassign; hold, compliance and recheck; remarks, real file upload and relationship projection; release and custody; external handoff/return; template update/deactivation/deletion retention; document deletion; read-only drift checks; injected shadow failure rollback; endpoint sessions, visibility, identifiers, filters, pagination, task modes, template permission/version, and disabled-flag fallback. Phase 2 and Phase 3 tests still pass. Lint and the full integration suite were rerun; the suite remains at its 24/26 baseline with the same two admin-override expectation failures. No new failure was introduced.

To disable targeted reads quickly, remove or set `HRMDO_DOCUMENT_TARGETED_READS_ENABLED=0` and restart/reload the PHP process. No React screen currently calls the new endpoints. If a shadow write fails, source writes roll back; investigate the schema/data error and reconcile with `--verify`/`--apply` before re-enabling targeted reads. Keep the new tables and synchronization while the source API remains active. A full Phase 4 code rollback can remove the new endpoints and the `persist_state()` hook, then leave the shadow tables unused; do not remove `app_records` or restore already-deleted source data.

## Phase 5 recommendation

Start with a limited, read-only screen such as the non-payroll Document Registry list, then document detail, behind a reversible client flag. Preserve server authorization and compare results against `state.php` during rollout. Task queues have more assignment and external-state branches and should follow only after registry parity is demonstrated. Do not switch writes or remove `state.php`, `load_state()`, or polling in that phase without separate evidence and approval.
