# Phase 6: targeted Document Detail read rollout

## Flow and dependency audit

Legacy: Registry, My Tasks, Header or another screen selects a full `AppContext.documents` record; `DocumentDetailModal` renders it and uses AppContext for audit, shared data and operations. Targeted mode applies only when the Registry calls `openTargetedDocument(id)`. `DocumentDetailModal` then requests `GET /api/documents.php?id=...` and renders the authorized normalized detail. Other entry points keep their legacy selection behavior. Registry Payroll exclusion means this rollout does not alter Payroll document detail; Payroll-specific item and employment-routing state in the modal remains sourced from AppContext for legacy entry points.

| Detail dependency | Phase 6 source |
|---|---|
| Identity, tracking/barcode, header, status, priority, source, encoder, remarks, hold/compliance/release and external state | Document `source_json` in targeted detail, with normal typed projection synchronization. |
| Instantiated workflow steps, assignment, completion, handoff/return, current step | `document_workflow_steps` snapshots, never the latest workflow template. |
| Normal and compliance attachment metadata | `document_attachments` snapshots; physical bytes are not in the response. |
| Custody history | `document_custody_history` snapshots; the Details tab now shows the movement timeline. |
| Document audit events | New `auditEvents` response member from a query of `app_audit` filtered by the authorized document ID. No unrelated audit events are returned to the targeted modal. |
| Current user, capabilities, personnel choices, payroll item/routing context, mutation functions | Existing AppContext/shared configuration. No duplicate whole-state payload is added to the detail response. |
| Classifications and current workflow templates | Not read by this detail modal for rendering; document instance data is used. |

The detail contract in `documentApi.ts` is `DocumentDetailPayload = { data: DocumentRecord; auditEvents: AuditEvent[] }`. The existing authorized ID/tracking/barcode HTTP lookups share this shape. The Registry uses ID; global Header search is not migrated. `document_repository_detail()` reconstructs child arrays from the normalized instance tables while retaining other document-specific fields from the synchronized parent snapshot. The audit query runs only **after** the existing `can_view_document()`-protected lookup; a missing or concealed document returns 404. Audit JSON filtering may scan `app_audit`; measure larger data before choosing a schema/index change.

## Flags, loading and rollback

Backend `HRMDO_DOCUMENT_TARGETED_READS_ENABLED=1` is required for all targeted document reads. Frontend `VITE_DOCUMENT_REGISTRY_TARGETED_READS=1` controls the Registry list. Independent frontend `VITE_DOCUMENT_DETAIL_TARGETED_READS=1` controls detail reads opened from the Registry. Both frontend values are applied at build time and default to `0` in `.env.example`. Registry ON/detail OFF uses the Phase 5 list and legacy modal; Registry ON/detail ON uses the targeted list and detail. Detail ON also works with the legacy Registry list, but only Registry entry opens targeted detail. Rebuild/redeploy with detail `0` to restore legacy detail without changing the Registry flag or database data.

The Registry passes only the selected ID in targeted mode; it does not first find a full document in AppContext. The modal shows a loading view, then the targeted response. An ID/revision-specific request identity ignores late results after close, selection changes, or refresh. A 404 shows a concealed/not-found message; a 401 triggers the existing session refresh and shows a sign-in message; other failures show a generic message and Retry. No error silently substitutes AppContext's document. The close action clears cached detail so reopening the same ID loads afresh. The selected targeted ID is saved with workspace location and restored only when the detail flag is enabled.

## Writes, freshness and revision

All claim, completion, return, reassignment, approval, release, remark, file, hold, compliance and external actions still call AppContext operations and `state.php`. `app_records` remains authoritative, with the normalized projection and audit committed in the same transaction. The existing global revision check still guards writes. Targeted GETs do not change that protocol.

After a successful mutation, AppContext accepts the new revision from `state.php`. The open targeted detail immediately requests the new normalized detail and document audit; the targeted Registry list also refetches on that revision. Repeated five-second polls with the same revision do not trigger duplicate targeted reads. Loading replaces the old detail while the new revision is requested. A failed mutation leaves the targeted detail unchanged. External users' changes are picked up when the existing state poll observes a higher revision. The five-second poll, focus/online refresh, initial state load and post-write whole-state response are otherwise unchanged.

`api/files.php` still verifies attachment owner visibility against authoritative state and file integrity before download. The detail response contains metadata and existing protected file URLs only. A known file ID is not permission. The isolated test confirms authorized access and a 404 for a restricted user.

## Parity, tests and local measurement

`tests/phase6-detail-api.test.mjs` compares the **complete** targeted `DocumentRecord` with the same authenticated user's legacy record after registration, completion, return, hold, compliance, recheck, remark, release, external handoff and external return. It compares document-only audit events with the legacy visible audit subset; tests administrator and processor access through Person, Role and Team assignments, restricted ID/tracking/barcode concealment and nonexistent IDs, and protected attachment download. No intentional field difference was found in the tested lifecycle states.

`tests/ui/detail-targeted.spec.ts` covers loading, workflow, custody, attachment and audit display; 404/server errors and Retry; close during a request; rapid close/reopen with a slower first response; and two `state.php` mutations followed by explicit detail/list refresh. The Phase 5 UI tests cover Registry targeted ON/detail OFF and default legacy mode. The only new visual information is the custody movement timeline in the Details tab.

One isolated fixture with four documents, one attachment and multiple lifecycle events sampled each path five times over local HTTP:

| Request | JSON bytes | Median wall time |
|---|---:|---:|
| `state.php` full authorized state | 32,951 | 21.46 ms |
| `documents.php?id=...` with document audit | 8,198 | 14.47 ms |

These are same-database, small-fixture measurements, not production latency or throughput claims. The targeted payload is smaller, but AppContext still polls and other screens still use `load_state()` and `AppContext.documents`. Phase 6 does not remove the global whole-state network cost.

## Phase 7 recommendation

Measure the remaining whole-state request cost with representative data and several concurrent users before changing polling. A separate, reversible targeted My Tasks read is a candidate next screen, but it needs assignment/external-state parity and should not be combined with this detail rollout. No Phase 7 work is included here.
