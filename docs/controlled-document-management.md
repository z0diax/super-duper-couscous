# Controlled Document Registry editing and deletion

Implemented 13 October 2026. No database migration or production data repair is required.

## Architecture and permission findings

Predefined documents are written to `app_records` and mirrored into normalized `documents`, `document_workflow_steps`, `document_attachments` and `document_custody_history`. Dynamic Others documents live only in those normalized tables. The earlier compatibility repair supplies authorized dynamic snapshots to default frontend views without adding them to legacy write state.

Document Registry previously exposed administrator-only Delete and no metadata editor. Both `domain.php::delete_document` and `document_routing_repository.php::routing_delete` allowed deletion without a processing-state restriction; the dynamic path even allowed completed records. Processing actions already protect historical/concluded documents. There is no separate configured retention exception for Registry metadata corrections.

Creator authorization now compares the authenticated account ID with the immutable `encodedBy.userId`. Names, source offices and request-supplied identities are never used. Administrator means the existing administrator role or a role with `canAdmin`. Other roles do not gain edit/delete access merely because they can process or supervise a document.

`documents.php` now handles authenticated, CSRF-protected management POSTs (`edit`, `correct`, `delete`) using the existing normalized repository/projection. `GET documents.php?manage=1&id=...` supplies a coherent authorized editing snapshot even when paginated targeted reads are disabled. Existing read-rollout gates remain unchanged. Dynamic registration/Forward/Complete continue through their existing endpoint.

## Exact definition of processing started

The sole server implementation is `api/document_management_policy.php::document_processing_started`; permissions and every deletion path use it. UI rows and modal controls receive its derived permissions from the server rather than reimplementing the predicate.

The function returns `true` for any actual recorded processing audit action: step completion/return, approval, release, rejection/disapproval, task claim/reassignment, remark addition, post-registration attachment upload, hold/compliance/resolution, external handoff/return, dynamic Forward or Complete. Corresponding completion/hold/release fields, step action/remarks/completion/external events, or custody events after the initial registration event also establish processing.

Automatic assignment, `startedAt`, and an `In_Progress` status alone do **not** establish processing. Initial INTAKE or DOCKETED_SENT is ignored only when its actor ID and timestamp match the creator and registration timestamp. For predefined workflows, the registration-generated first Receive completion is ignored only when all of these match: first internal step, at least two steps, Receive action, non-personnel-pool assignment, Completed status, exact action text `Document intake and initial docketing completed during registration.`, completion timestamp equal to `dateEncoded`, and completed-by ID equal to the creator. A later actual Receive action has a processing audit event and is protected even if its timestamp matches registration.

To return `false`, the function also requires confirmed DOCUMENT_REGISTERED audit evidence for the creator, consistent step numbering/counts/current step, an active In_Progress current assignment with `isCurrent` and `startedAt`, pending future stages, and a recognized initial active document status. A dynamic initial snapshot must have exactly one current Person assignment. The only allowed initial current step numbers are 1, or 2 after the exact automatic predefined intake described above.

Missing creator/registration/custody/step data, unrecognized document audit events, inconsistent initial stages or unknown states return `null`; all modification permissions are denied. Historical V1 records and Released, Archived, Disapproved, Completed or Cancelled records are protected regardless of the predicate result.

## Editable fields and modes

Before processing, the creator or administrator may edit title, subject, description, source office, source type, sender name/contact and priority. Input types, required title/office, lengths and allowed source-type/priority values are checked on the frontend and backend. Empty/no-op changes are rejected rather than reported as an audited modification.

After processing, the creator can still view the record but cannot edit/delete it. An administrator may use **Administrator Correction** for the same safe descriptive fields on active records, with a mandatory reason. Changes are audited as DOCUMENT_CORRECTED with per-field before/after values; actor ID/name/role and timestamp are captured by the existing audit writer. Before-processing edits use DOCUMENT_EDITED.

ID, tracking number/barcode, creator identity, original timestamps, classification, document type, employment classification, workflow template/version, assignments, current stage/status/location, SLA, attachments, holds, completed actions and custody/history are not editable through this feature. Classification/type remain read-only even before processing because safe workflow replacement would require rebuilding the immutable registered workflow and assignments. The modal explains this restriction; no routing rewrite is introduced.

Payroll is already excluded from Document Registry. This feature does not change the separate Payroll module's existing workflow/deletion behavior. Historical/concluded Registry records have no correction/deletion override.

## Deletion and audit preservation

The confirmation dialog displays tracking number and document title, explains removal from active queues and attachment access, accepts an optional reason, and requires an explicit Delete Document action. Only the creator or administrator can delete an unprocessed, unprotected record.

Inside the locked transaction, deletion rechecks authorization, processing and version, records DOCUMENT_DELETED with the full pre-deletion snapshot and reason, removes normalized children/parent, removes any predefined `app_records` document row, and revokes `app_files` metadata/access. The audit row remains. Physical upload files keep the existing cleanup/retention policy; this feature does not introduce filesystem erasure.

The old legacy delete operation enforces the same policy under its global revision lock. The old routing delete endpoint enforces the same policy and requires `expectedVersion`. Administrator audit views retain DOCUMENT_DELETED events after the corresponding record disappears; other audit-view scopes are unchanged.

## Transactions, concurrency and refresh

Management POSTs lock `app_meta` first, then the document (and its predefined source row where applicable), following existing write ordering. They reauthenticate and re-evaluate current server permissions inside the transaction. A canonical document hash plus processing state supplies `expectedVersion`; stale metadata, audit-only claims, Forward, completion or other processing changes reject a previously opened form with a clear conflict. Predefined source/projection disagreement also rejects writes.

Metadata edits update only the normalized parent row and the corresponding predefined source row. Child workflow/custody/attachment rows are not rewritten. Dynamic documents never enter `app_records`. Metadata and audit/revision commit together; an injected audit failure proves rollback of both document sources and the revision.

The form guards duplicate submissions, traps keyboard focus, restores focus/scroll on close, displays field-level validation, preserves failed input and offers explicit latest-document reload after conflicts. Success follows a confirmed committed response only. Document/dashboard invalidation refreshes Registry, queues, details and shell counts through existing hooks and legacy snapshot refresh. Header search discards stale cached/in-flight results; subsequent searches read updated metadata.

## Files modified

- `api/document_management_policy.php` — shared processing/ownership/retention policy and metadata allowlist.
- `api/document_management.php` — locked per-record metadata/deletion writer and audit changes.
- `api/documents.php` — management retrieval and POST integration in the existing endpoint.
- `api/document_repository.php` — permissions for targeted Registry/detail and batched audit evidence.
- `api/domain.php` — legacy deletion enforcement and retained administrative deletion-audit visibility.
- `api/state.php` — legacy-view permissions and full legacy deletion audit snapshot.
- `api/document_routing_repository.php`, `api/document_routing.php` — enforce controlled routing deletion and return current permissions.
- `src/components/DocumentManagementModal.tsx` — edit, administrator correction and delete dialogs.
- `src/components/DocumentRegistry.tsx` — compact View/Edit/Correct/Delete controls using server permissions.
- `src/components/Header.tsx` — invalidate stale search results after document changes.
- `src/services/documentApi.ts`, `src/types.ts` — management contract and confirmed writes.
- `tests/document-management.test.mjs`, `tests/ui/document-management.spec.ts` — ownership, processing, retention, conflicts, audit, rollback and both frontend modes.
- `tests/dynamic-routing.test.mjs`, `tests/ui/dynamic-routing.spec.ts` — protect processed/completed records while retaining dynamic lifecycle coverage.
- `tests/integration.test.mjs`, `tests/phase4-shadow-api.test.mjs` — updated ownership wording, retained concluded documents, unprocessed deletion parity and management POST validation.
- `tests/ui/registry-targeted.spec.ts` — use the new accessible View action label.
- `docs/dynamic-others-routing.md`, this report — current policy and implementation findings.

## Verification and limits

All tests use separately named `hrmdo_test_*` databases and fixture upload directories. No production documents were deleted or edited, and no production tables were reset, recreated or migrated.

Coverage includes all requested cases: creator edit/delete before processing; another user's/assignee's direct requests rejected; creator edit/delete after processing denied; administrator correction reason and before/after audit; immutable identity/tracking/history fields; predefined and dynamic lifecycle continuity; attachment preservation and deletion revocation; stale metadata and processing conflicts; default/targeted Registry and detail refresh; retained audit records; and rollback after a real audit-write failure. A separate test proves management works with targeted reads disabled while ordinary targeted GETs retain their existing rollout gate. Shadow parity verification passes after metadata changes and dynamic deletion.

Limits are deliberate: classification/type/routing and attachments are read-only; incomplete older records fail closed; no active-document hard deletion or new void workflow is provided; no concluded-record retention exception is added; physical uploads use existing retention rather than new erasure. No new schema, database constraint relaxation, permission bypass or automatic mutation retry is introduced.
