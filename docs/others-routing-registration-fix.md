# Others registration investigation — 13 October 2026

## Reproduced cause

The existing dynamic browser test failed against the actual default frontend build: registration returned a saved document and opened Routing History, but Alice's My Tasks contained no document (`tests/ui/dynamic-routing.spec.ts`, original line 30). The backend integration tests passed unchanged.

`RegisterDocumentModal.tsx:92` chooses dynamic routing for Others with no matching active workflow. Line 148 sends the selected option's account ID as `initialAssigneeId`; line 152 calls `registerRoutedDocument`. This selection and payload were correct. Matching predefined workflows still use normal registration.

`document_routing_repository.php:53-54` stores the document, initial Person assignment and DOCKETED_SENT custody event in normalized tables only. `document_routing.php:8-19` encloses these writes, attachment ownership, audit and revision in one transaction, holds the shared metadata lock and returns data only after commit. These paths were working.

`api/store.php:23-28` loads documents exclusively from `app_records`. Default builds leave targeted registry/tasks flags off (`DocumentRegistry.tsx:30`, `MyTasksQueue.tsx:27`), so those screens consume the legacy snapshot. Native dynamic documents were absent from that snapshot even though normalized registry/detail/task queries could find them. Resource invalidation also refreshed targeted consumers only, leaving legacy consumers waiting for their state poll. Previous documentation required targeted builds; existing API tests bypassed the broken legacy read path, and the browser test had only been prescribed for targeted builds.

## Repair

- `api/document_repository.php`: add a read-only dynamic snapshot using existing SQL visibility and record-level authorization.
- `api/state.php`: merge authorized dynamic records into response data **after** all legacy writes. Keep `load_state`/`persist_state` unchanged; never copy dynamic documents into `app_records`.
- `src/context/AppContext.tsx`: refresh legacy snapshots on document invalidation. Lightweight clients retain targeted refresh behavior.
- `src/components/DocumentRegistry.tsx`: preserve routing mode in legacy rows and use normalized detail/deletion for dynamic records.
- `src/components/MyTasksQueue.tsx`: open dynamic records through normalized detail in either rollout mode; include completed dynamic records in the concluded queue. Personal/team assignment conditions are unchanged: a Person assignment belongs to the selected employee, not the whole team.
- `src/components/RegisterDocumentModal.tsx`: validate selected employee against fetched accounts, guard simultaneous submissions, retain form on failure, and display registration errors consistently.
- `src/services/documentApi.ts`: require a response with a document ID, tracking number and dynamic routing mode before accepting a successful routing action or invalidating consumers. An unconfirmed response advises checking the barcode before retrying.
- `scripts/audit_dynamic_routing.php`: add a reusable CLI-only, read-only consistency audit.
- `tests/dynamic-routing.test.mjs`, `tests/ui/dynamic-routing.spec.ts`: expand regression coverage for default and targeted builds, real transaction failures and duplicate submission protection.
- `docs/dynamic-others-routing.md`, this report: document the compatibility path and verification.

No change to workflow precedence, predefined write behavior, authorization, database schema or constraints was needed. Duplicate barcodes remain rejected under the existing metadata lock; no automatic POST retry is introduced.

## Existing-data inspection

The read-only audit of the configured local deployment found 5 dynamic documents, 0 missing initial assignments, 0 missing initial custody events, 0 invalid active assignees, 0 projection mismatches, 0 legacy copies and 0 orphan steps/custody events. No data repair was performed. The test fixtures use separately named `hrmdo_test_*` databases; their setup, failure triggers and cleanup never target production tables.

## Regression evidence

The expanded integration suite covers all ten requested cases: no workflow, custom type Hiring, initial employee assignment, normalized and legacy registry visibility, assigned employee tasks (with team exclusion), detail, Forward/Complete, transaction rollback, duplicate submissions and predefined workflows. It also verifies unauthorized users cannot see the dynamic snapshot and ordinary workflow changes cannot rewrite it.

A test-only custody INSERT trigger forces a failure after parent/assignment/attachment writes. Assertions verify rollback of all normalized rows, attachment ownership, audit count and revision. Removing the trigger permits retry of the same barcode. Concurrent submissions from two sessions yield one 200 and one 409, with exactly one set of document/assignment/custody records per barcode.

The browser test forces the same real database failure, verifies an error with the form retained and no detail/success transition, retries successfully, inspects the exact selected employee ID/custom type in the POST, and verifies returned ID/tracking number. Two immediate form submissions produce one POST. It checks immediate registry visibility and detail access, signs in as each employee, then exercises Forward, attachment download, Complete and registry deletion.

Validation completed against both frontend rollout builds. The final `dist` build uses the original default build configuration.

| Check | Result |
| --- | --- |
| `node --test tests/dynamic-routing.test.mjs` | 3 passed |
| `node --test tests/integration.test.mjs tests/phase3-document-repository.test.mjs tests/phase5-registry-api.test.mjs tests/phase6-detail-api.test.mjs tests/phase7-tasks.test.mjs` | 31 passed |
| Default-build dynamic browser scenario | Passed, including actual rollback, retry, duplicate form submission, registry, assignment, details, Forward/Complete and deletion |
| Targeted-build dynamic, tasks-rollout, registry-targeted and detail-targeted browser suites | 10 passed; 1 expected flag-off test skipped |
| Final default-build dynamic, registry-legacy, tasks-rollout and app browser suites | 10 passed; 2 expected flag-on tests skipped; 1 predefined-registration timing failure |
| Focused rerun of the predefined catalogue/workflow/registration browser test | 1 passed |
| Focused payroll intake/deletion browser rerun | Passed; the earlier broader run had a final deletion assertion timeout |
| `npm run lint` | Passed |
| `npm run build`, default and targeted document flags | Passed; final default build restored |
| PHP syntax, routing endpoint/repository, state, normalized repository and audit script | Passed |
| `git diff --check` | Passed |

The broader browser runs were not uniformly green: the final default run timed out on an existing five-second detail-open assertion while predefined registration still showed Saving changes. That scenario passed in the earlier broad run and on the focused final rerun. The earlier payroll deletion timeout also passed on its focused rerun and in the final broad run. No unrelated payroll or predefined-workflow implementation changes were made to suppress these timing failures. Every dynamic-routing regression passed in both rollout modes after correcting a test selector that matched both the title and subject.
