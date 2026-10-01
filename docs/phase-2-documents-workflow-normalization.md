# Phase 2: Documents + Workflow shadow schema

This phase adds a parallel relational representation. `app_records` remains authoritative; the PHP API still uses `load_state()` and `persist_state()`. No React path, authorization rule, search, polling, workflow transition, or global revision behavior changes. These tables alone do not improve request performance. Targeted reads are a later phase.

## Tables and mapping

| New table | Key and source |
|---|---|
| `workflow_templates` | `(id,version)`; current `workflowTemplates` header. Older backed-up versions remain when a later version is backfilled. `is_current` marks the source's current version. |
| `workflow_template_document_types` | `(template_id,template_version,position)`; `documentTypes[]`, or the singular `documentType` for older records. |
| `workflow_template_steps` | `(template_id,template_version,step_number)`; ordered `steps[]` with routing, assignee, SLA, action, hold/return, attachment and external configuration columns. |
| `documents` | `id`; document header, search/routing/status fields, encoder, template ID/version, hold and release summary columns. |
| `document_workflow_steps` | `(document_id,step_number)`; each document's **instantiated** `workflowSteps[]`, including current assignment/status, external state and return receiver. The document remains independent of later template edits. |
| `document_attachments` | `(document_id,attachment_kind,position)`; `attachments[]` and `complianceAttachments[]`. A file can appear in both arrays without duplicating a physical file. Step number links normal/supporting files to their step. Exact attachment JSON retains other usage metadata. |
| `document_custody_history` | `(document_id,position)`; `custodyHistory[]` in exact source order, with movement ID/time, locations, actor and representative. |

Every parent/step/attachment/custody row retains `source_json` and its SHA-256. This preserves optional fields that are not yet proven queryable: personnel pools, handoff/return payloads, supporting file IDs, release receipt, compliance details, actor names, remarks, legacy metadata, and any historical extensions. The typed columns support later targeted queries; the JSON snapshot supports exact reconciliation and safe rollback. For current template versions, source JSON is the template from `app_records`; old template versions cannot be reconstructed if they were overwritten **before** this phase, so document instance snapshots remain the authority for old execution history.

Child tables have foreign keys to their normalized document or template version. There are deliberately no user, `app_files`, or document-to-template foreign keys yet: old users/files/templates can be absent and current templates are mutable. The backfill reports those relationships. `app_files` still owns file metadata and disk contents; `api/files.php` still checks owner visibility before download. `app_audit` remains authoritative for audit events.

## Indexes

`documents` has nonunique tracking/barcode indexes for exact lookup, `(status,current_step_number)` for queues, `(classification,document_type)` for registry/routing, `workflow_template_id` for linkage, and `(encoded_by_user_id,status)` for scoped lists. Nonunique indexes avoid making historical duplicates a migration failure. `workflow_templates(classification,is_active,employment_classification)` and template document type index support template resolution. Document instance indexes on `(status,assigned_user_id)`, `(status,assigned_role)`, and `(status,assigned_team)` prepare assignment queues. `document_attachments(file_id)` supports file relationship checks. `document_custody_history(document_id,movement_at)` supports timelines. Parent primary keys also serve child lookups by parent. Indexes add storage and write cost; review query plans before adding more.

## Migration procedure

Prerequisites: current PHP CLI with `pdo_mysql`, database credentials from `api/db.php`, a database backup, and a quiet maintenance window. The script locks `app_meta` while copying, which blocks state requests until its data transaction commits. It does not increment the revision. On a large database, assess lock duration on a copy first.

```sh
php scripts/backfill_documents_workflow.php --check
php scripts/backfill_documents_workflow.php --apply
php scripts/backfill_documents_workflow.php --verify
```

`--check` performs source validation without writing tables. `--apply` creates missing tables from `database/phase2_documents_workflow.sql`, rechecks the source revision under lock, then upserts parent rows and replaces only their child rows in one transaction. A failure rolls back all data changes for that run. MySQL DDL itself is not transactional, so a failed first run may leave empty new tables; rerunning is safe. It never changes `app_records`, `app_files`, or the source revision. `--verify` reads source and shadow tables and compares counts, IDs, every projected typed value and complete JSON snapshots/hashes. Use `--apply` again after source changes; there is intentionally no live dual write in this phase. The script leaves historical template versions in place. It reports extra current rows when a source record has been deleted, rather than deleting the shadow row silently.

Preflight rejects malformed JSON, missing/mismatched IDs, non-array step/attachment/custody structures, duplicate or invalid step numbers, an absent current step, multiple current flags, malformed attachment/custody entries, and impossible external status. It warns about missing current template, users or file metadata, out-of-order steps, file ownership mismatch and current-step flag inconsistency. Warnings preserve source snapshots and should be reviewed before a read cutover. The app's `(collection,id)` primary key prevents duplicate top-level IDs; duplicate nested step numbers remain possible and are checked.

## Observed local migration and verification

On 2026-09-30, `--check`, `--apply`, and verification against the configured local database reported no issues:

| Entity | Source | Normalized |
|---|---:|---:|
| Documents | 29 | 29 |
| Workflow templates (current) | 10 | 10 |
| Template document type links | 10 | 10 |
| Template steps | 55 | 55 |
| Document workflow steps | 117 | 117 |
| Attachment relationships | 0 | 0 |
| Custody movements | 57 | 57 |

The local dataset contains no document attachment relationships, so the attachment mapping was exercised in an isolated test fixture with two relationships to one file metadata row. The fixture also tested external handoff state, a document pointing to an older template version, idempotent rerun, version retention, changed-source detection and invalid current-step reporting. These are local measurements and tests, not production counts. Run `--verify` again immediately before any later read cutover because the app continues writing only `app_records`.

## Rollback

The production API does not read the new tables, so an application rollback requires no API or frontend changes. To remove the shadow representation after retaining any desired verification reports, drop **only** these new tables in child-to-parent order: `document_custody_history`, `document_attachments`, `document_workflow_steps`, `workflow_template_document_types`, `workflow_template_steps`, `documents`, `workflow_templates`. Verify table names and the target database first. `app_records`, `app_users`, `app_files`, `app_audit`, and `app_meta` must remain untouched. Alternatively, leave the unused shadow tables in place and rerun the backfill later.

## Tests and known discrepancy

`php -l scripts/backfill_documents_workflow.php`, `npm run lint`, `node --test tests/phase2-backfill.test.mjs`, and the existing integration suite were run. The Phase 2 test passes. The existing suite's baseline is 24/26: two cases expect 403 while `document_action()` permits the current administrator override and returns 200. Phase 2 does not alter that rule or those tests. UI/Playwright and production load tests were not run.

## Phase 3 boundary

Measure state GET/POST latency, response bytes and memory at representative loads. Then design targeted document reads that use the shadow tables, enforce the exact `can_view_document()` and attachment-owner semantics, and support a reversible read switch. Keep the instantiated workflow snapshot and current template version separate. Phase 3 is not implemented here.
