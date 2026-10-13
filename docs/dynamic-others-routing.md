# Flexible routing for Others

Previously registration required an active catalogue type and matching workflow. My Tasks and document detail already had normalized, targeted reads, while ordinary workflow writes continued through the existing state operations.

Others now accepts a manual type. A matching active template takes precedence. Only Others without a matching template can use dynamic routing. Ambiguous templates remain errors.

## Storage and actions

No migration is required. Dynamic documents are native records in `documents`, with person assignments in `document_workflow_steps`, attachments in `document_attachments`, and append-only transfers in `document_custody_history`. They have no workflow template. The record snapshot carries `routingMode=dynamic` and `routingRevision`; assignment rows carry `assignment_source=dynamic`. Assignment rows represent successive handlers, not configured phases.

`GET api/document_routing.php` returns eligible current accounts from `app_users` with configured roles. The current account model has no inactive flag; it permits person assignments regardless of role capability. No employee list or organizational unit is added.

`POST api/document_routing.php` accepts:

- `action=register`: existing intake fields, manual `documentType`, and `initialAssigneeId`.
- `action=forward`: `documentId`, `routingRevision`, `targetUserId`, and required `remarks`.
- `action=complete`: `documentId`, `routingRevision`, and required `remarks`.
- `action=delete`: `documentId`; requires the same `canAdmin` permission as ordinary document deletion.

Registration enforces `canIntake`, Others eligibility, and the absence of a matching template. Forward/Complete require the exact current assignee; no new administrator override is introduced. All writes enforce authentication and CSRF, share the existing metadata lock order, lock the document row, validate employee references inside the transaction, and update assignments, history, audit, and revision atomically. Completed documents and stale revisions reject subsequent actions. Self-forwarding is rejected.

Each event preserves from/to account IDs, names, actor, UTC timestamp, action, and remarks. Forward ends the current assignment and creates the successor. Complete uses the existing `Archived` document status, records completion details, and adds a Completed event. The existing completed queue includes dynamically completed documents; normal workflow queue conditions remain the same.

My Tasks and registry keep their existing paginated queries. Dynamic rows show handler terminology and open the existing detail modal. The detail modal provides Routing History, Complete/Forward dialogs, document information, attachments, and audit. File authorization uses the normalized document policy for native dynamic documents, preserving access for current and previous handlers. Backfill verification excludes native dynamic records from shadow-source parity checks and preserves their rows.

Dynamic records are never written to the `app_records` document collection. Registration and routing actions use targeted writes. For builds with legacy registry/task reads, `state.php` adds authorized normalized dynamic snapshots to its read response after legacy persistence has finished. These snapshots never enter `load_state` or `persist_state`, so ordinary workflow operations cannot overwrite them. Document invalidation immediately refreshes legacy snapshots; targeted clients keep their existing resource refreshes. Reference configuration and barcode collisions in older modules are checked through targeted queries. Backup/restore includes normalized document and template tables in foreign-key dependency order so native records survive recovery.

The registry offers administrators the same Delete, Confirm, and Cancel controls for dynamic and ordinary documents. Dynamic deletion uses the targeted routing API, locks the record, removes normalized children and the document, revokes attachment metadata/access, and updates the application revision in one transaction. It supports both active and completed documents. A `DOCUMENT_DELETED` audit event retains the tracking number and full custody chain. Attachment metadata cleanup follows ordinary document deletion; physical upload files retain the existing cleanup behavior. Non-administrators cannot delete even their own assigned documents, and predefined workflow records continue using the existing deletion API.

## Configuration and verification

Files changed for this feature:

- Backend: `api/document_routing.php`, `api/document_routing_repository.php`, `api/document_repository.php`, `api/domain.php`, `api/files.php`, `api/.htaccess`, `.htaccess`.
- UI/types: `src/components/RegisterDocumentModal.tsx`, `src/components/DocumentDetailModal.tsx`, `src/components/DynamicRoutingPanel.tsx`, `src/components/MyTasksQueue.tsx`, `src/components/DocumentRegistry.tsx`, `src/services/documentApi.ts`, `src/types.ts`.
- Recovery: `scripts/backfill_documents_workflow.php`, `scripts/backup.php`, `scripts/restore.php`.
- Tests: `tests/dynamic-routing.test.mjs`, `tests/ui/dynamic-routing.spec.ts`, `tests/router.php`.
- Documentation: this file.

This feature uses the project's targeted document rollout. The application root `.htaccess` enables `HRMDO_DOCUMENT_TARGETED_READS_ENABLED=1` for Apache requests. Apache applies this per request without a restart. For other PHP hosting environments, enable this variable in the server configuration. `VITE_DOCUMENT_TASKS_TARGETED_READS=1` and `VITE_DOCUMENT_REGISTRY_TARGETED_READS=1` enable paginated reads; the optimized environment example also enables detail, search, and shell reads. Legacy full-state registry/inboxes also display authorized dynamic records through the compatibility read response. Both modes open dynamic details through the normalized endpoint. Restart the PHP server when changing process-level environment variables.

Tests:

- `node --test tests/dynamic-routing.test.mjs tests/phase7-tasks.test.mjs tests/phase3-document-repository.test.mjs tests/integration.test.mjs`
- `npm run lint` and `npm run build`
- Run `npx playwright test tests/ui/dynamic-routing.spec.ts tests/ui/tasks-rollout.spec.ts` against both the default build (flags off) and a build with targeted document flags enabled.
- `php scripts/audit_dynamic_routing.php` performs a read-only check of existing normalized dynamic documents, initial assignments/custody, active employees, projection consistency, legacy copies, and orphan children. It never repairs or deletes data.

Coverage includes required inputs, deleted/invalid users, CSRF, direct unauthorized calls, simultaneous forwarding, stale revisions, multiple handlers, task transfer/counts, attachment downloads, history persistence, completion and repeated-action rejection, normalized-only storage, backfill verification, backup/restore, predefined Others workflow precedence, administrator-only active/completed deletion, attachment revocation, and retained deletion audit. Browser coverage exercises registration, forwarding, completion, attachment downloads after transfer, login changes, refresh, and registry Delete/Cancel/Confirm through the existing UI.

The registration regression also checks custom type `Hiring`, the exact selected employee ID in the request, immediate registry visibility, legacy state visibility and authorization, forced custody-write rollback (including attachment ownership/audit/revision), safe retry, and concurrent duplicate barcode submissions. Browser coverage forces a real database write failure in an isolated fixture, verifies the error and retained form, then retries the same barcode successfully.
