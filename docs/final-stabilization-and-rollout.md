# Final stabilization and optimized rollout

Verified on 2026-10-02 against the current source and disposable MariaDB/PHP fixtures. This closes the Phase 1–11 optimization work. No new architecture or projection was introduced.

## Final status and architecture

**READY WITH KNOWN LIMITATIONS.** The optimized build, clean installer, additive backfills, core API workflows, targeted browser paths, multi-user revision handling, and legacy rollback passed the checks below. Production deployment still requires a backup, migration/verification against a copy of the actual deployment database, PHP gate configuration, and an operator smoke test in that environment. The local tests do not prove production latency or every browser/device combination.

`app_records` and the existing `state.php` transaction remain authoritative. Document/Workflow and Payroll tables are maintained read projections. Targeted operational APIs serve bounded reads. `state.php` still performs initial bootstrap and business POSTs. In optimized mode `revision.php` handles visible five-second synchronization without `load_state()`, and `reference.php` refreshes user/configuration references after `config_revision` advances. No routine `state.php` GET is expected after bootstrap. Legacy mode retains full-state polling.

## Configuration and backend gates

Safe repository defaults are in `.env.example`: all targeted flags and lightweight sync are `0`. The deployable build example is `.env.optimized.example`: all eight targeted flags and `VITE_LIGHTWEIGHT_STATE_SYNC=1`. These are **build-time** Vite values. The PHP process needs all four server-side gates **before** serving that build:

| PHP environment gate | Frontend reads covered |
| --- | --- |
| `HRMDO_DOCUMENT_TARGETED_READS_ENABLED=1` | Registry, Detail, Tasks, Search, Document Shell |
| `HRMDO_PAYROLL_TARGETED_READS_ENABLED=1` | Payroll lists, detail, tasks, search and shell |
| `HRMDO_DASHBOARD_TARGETED_READS_ENABLED=1` | Dashboard |
| `HRMDO_LEAVE_EWP_TARGETED_READS_ENABLED=1` | Leave detail/history and EWP page |

`revision.php` and `reference.php` are authenticated endpoints without separate rollout gates. No secret belongs in a `VITE_` variable. The optimized example intentionally contains no credentials. `vite.config.ts` rejects lightweight sync when any of the eight targeted flags is not `1`; a build with Payroll disabled failed with a clear list of missing flags. All-off legacy, all-targeted with legacy polling, and all-targeted with lightweight sync each built successfully. Vite reported only its existing bundle-size warning.

## Installation and upgrade

The new `tests/final-install-upgrade.test.mjs` created a disposable database, ran the real `scripts/install.php`, started the PHP application, signed in, checked `revision` and `config_revision`, and confirmed 19 required tables including users, files, audit, `app_records`, Document/Workflow projections, Payroll projections, and an index on `documents.legacy_id`. Rerunning the installer preserved the sole administrator and metadata. Both backfills then returned `status: ok` for `--apply` and `--verify`.

The Phase 2 fixture exercises a pre-projection `app_records` Document and workflow template with attachment metadata, custody and external stage data. It checks lossless projection, idempotent apply, drift detection and repair, and historical template versions. The Payroll API fixture exercises source-to-projection synchronization; the final clean fixture runs Payroll apply/verify. These passed as part of the 16/16 Phase 2–11 API suite. **Limit:** this is a representative upgrade fixture, not a copy of the actual deployment database. Before enabling targeted reads there, run:

```text
1. Back up the deployment database and uploaded files.
2. Set the PHP database and administrator environment securely.
3. php scripts/install.php
4. php scripts/backfill_documents_workflow.php --check
5. php scripts/backfill_documents_workflow.php --apply
6. php scripts/backfill_documents_workflow.php --verify
7. php scripts/backfill_payroll_reads.php --apply
8. php scripts/backfill_payroll_reads.php --verify
9. Enable the four PHP read gates; build/deploy with .env.optimized.example values.
10. Smoke-test login, Registry, My Tasks, Payroll, Leave and EWP against that installation.
```

Re-run projection verification immediately before cutover if writes occurred after backfill. Keep backup and database names explicit; never use the disposable test cleanup against a real database.

## Authentication, authorization and security

The 26/26 integration suite covers valid and invalid sign-in, logout, credential revocation, deleted users, session restoration in the browser, CSRF, and representative role boundaries. The Phase 11 API fixture confirms that role changes appear in `revision.php`, deleted users get 401, and reference changes follow `config_revision`. The optimized two-context browser test confirms visible conflict recovery without replay or duplicate EWP registration. The test does not simulate wall-clock expiry, but `authenticated_user()` and the session timeout path are checked on every protected request; 401 from lightweight sync clears the client identity by current implementation.

Document, task, Payroll, Work Group, Leave, EWP, configuration and file authorization are exercised by integration and targeted API tests. Phase 4 tests reject hidden Document IDs and anonymous reads; Phase 8 checks hidden exact and partial search, literal `%`, `_`, and SQL-like strings, invalid query shapes, and anonymous shell access. File tests cover authenticated download, hidden owner access, upload and uploader-only unattached cleanup. `bootstrap.php` returns generic 503 messages for unexpected exceptions and disables displayed PHP errors. This is a sanity pass, not a penetration test.

The two historical 24/26 integration failures expected administrators to be denied assigned-phase remarks/recheck and external return. `api/domain.php` explicitly allows `canAdmin` overrides, and Phase 1–4 documentation records that policy. The tests now assert permitted administrator actions while retaining non-admin denials. No backend permission was broadened.

## Operational workflow results

| Area | Result and evidence |
| --- | --- |
| Documents | Integration tests cover registration, workflow snapshot, person/role/team routing, claim, hold/compliance/recheck, return, attachment, approval, release, external handoff/return, custody and audit. Targeted Registry/Detail browser checks passed. Template changes retain historical instance snapshots in Phase 2/API tests. |
| Payroll | Integration tests cover single voucher, batch intake, classification, initial checking, Work Groups, item processing, exception/hold, compliance/recheck, progress and release. Targeted shell/list/tasks/detail browser check passed. |
| Leave | Integration tests cover registration, validation, permitted edit/status transitions, computation, signature/release and denial of unauthorized actions. Phase 10 targeted detail/history browser/API checks passed. |
| EWP | Integration and Phase 10 API/browser tests cover create/edit/delete, scoped list/search, pagination, totals and authorization. |
| Configuration | Integration tests cover users, roles, designations, classifications, workflow templates and employment routing. Phase 11 API/browser tests verify cross-user `config_revision` and `reference.php` refresh. |
| Files | Integration tests cover uploads/downloads and file-bearing actions; Phase 11 API covers uploader-only unattached DELETE and stale-write handling. An uncertain POST outcome still requires manual record review; cleanup is not automatic. |
| Concurrency | Phase 11 fixture checks A writes, B observes revision and writes, stale Payroll write returns 409, and simultaneous writes admit one winner. The two-context browser test preserves the EWP form on 409 and resubmits only after user action. |

## Lightweight sync, browser, and performance

The optimized browser suite passed **11/11** selected Detail, Registry, Payroll, Dashboard/Leave/EWP and Phase 11 tests. The Phase 11 browser test observed one `state.php` GET for initial bootstrap while the other context received revision updates, and confirmed no routine full-state GET. The source confirms `revision.php` selects only `revision,config_revision` and authenticated user, without calling `load_state()`.

All-targeted with legacy polling passed **4/4** selected browser cases. The all-off legacy build passed **9/9** after updating obsolete Payroll test controls/fields and Dashboard labels. The Leave calendar test now fixes browser time so its September 2026 selections are deterministic. One desktop viewport (1440×1000) and a 390×844 mobile overflow assertion passed; these are targeted UI checks, not a full visual/device audit. Existing loading, empty, retry and modal behavior were exercised in selected suites. The established freshness cadence remains 5 seconds for shell/tasks/Payroll, 15 seconds for Registry/Detail/Leave/EWP, 30 seconds for Dashboard, and search on submit; hidden tabs skip the revision timer, with focus/visibility/online refresh.

A local small regression benchmark used 100 and 1,000 records per main collection and 100/1,000 Payroll items. Three HTTP samples per endpoint produced these medians:

| Rows | `state.php` bytes / ms | `revision.php` bytes / ms | `reference.php` bytes / ms |
| ---: | ---: | ---: | ---: |
| 100 | 269,861 / 45.87 | 386 / 5.24 | 8,335 / 22.29 |
| 1,000 | 2,632,837 / 189.54 | 386 / 7.64 | 8,335 / 11.75 |

The revision response stayed 386 bytes as data grew; the routine sync path therefore did not return to full-state polling. These localhost medians are a sanity check, not a production capacity estimate. Phase 10/11 reports contain larger historical measurements and targeted page bounds.

## Legacy rollback

Build with all targeted frontend flags `0` and `VITE_LIGHTWEIGHT_STATE_SYNC=0`, using `.env.example` as the safe reference. The verified legacy build and browser smoke pass. For a narrower rollback, set only `VITE_LIGHTWEIGHT_STATE_SYNC=0` while retaining all targeted reads; that build and selected browser checks also pass, restoring routine `state.php` polling. Deploy the rebuilt assets before disabling any corresponding PHP read gate. Keep `state.php`, `load_state()`, `app_records`, projection tables, and `config_revision`; the rollback does not require dropping data.

## Issue classification and remaining work

| Class | Finding / disposition |
| --- | --- |
| BLOCKER | None found in the disposable fixture and selected browser/API suites. |
| IMPORTANT | A production-like copy of the actual deployment database has not been supplied or tested; perform migration verification and smoke checks there before final cutover. Broad browser/device coverage remains a deployment validation task. |
| MINOR | Stale integration administrator expectations and browser labels/Payroll controls were corrected. Vite's pre-existing bundle-size warning remains. |
| FUTURE | Consider initial bootstrap/report freshness changes or upload expiry only if later measured use warrants them. These are outside this stabilization. |

No unresolved issue in this test environment requires another architecture phase. Keep rollback assets and a tested backup available during rollout.
