# HRMDO Document Tracking System

React/Vite interface, PHP 8.2+ API, and MariaDB/MySQL persistence. Apache serves the production build. The server validates each named operation and commits affected records and audit events together. Stale operations receive HTTP 409 rather than overwriting another officer's changes.

## Current HRMDO workflow rules

This is the authoritative workflow summary for maintainers and future changes.

1. Receiving/Docketing and Initial Checking are separately configured responsibilities.
2. Employment Classification for batch payroll items is assigned during Initial Checking, not during Receiving.
3. A held payroll item does not block eligible sibling items.
4. Each `PayrollItem` owns its operational workflow stage; a `PayrollBatch` is a container and aggregate.
5. Batch progress is derived from its child items. The compatibility `PayrollBatch.currentStage` field is informational only and must not gate item routing.
6. JOW/COS, Casual, and Regular Stage 3 work groups run in parallel.
7. Stage 3 processors complete their assigned work, never a parent batch transition. The workflow engine performs item routing.
8. External offices are physical-custody destinations, not HRMDO users or internal assignees.
9. A document returning to HRMDO retains its Document ID and tracking number.
10. Backend authorization controls both actions and record visibility. Hiding a frontend control is not authorization.

## Payroll batch workflow

### Stage 1 - Receiving / Docketing - IMPLEMENTED

Receiving Personnel receive the physical submission, create one `PayrollBatch`, register its `PayrollItem` records, and record shared batch details and attachments. They do **not** classify items as JOW/COS, Casual, or Regular. Registration completes Docketing and assigns the batch to the configured Initial Checking person, role, or team. Receiving and Initial Checking can be the same person only when the Workflow Template explicitly configures that assignment.

Batch intake selects an active Payroll template by the selected document type before Employment Classification is known. A uniquely matching JOW/COS, Casual, or Regular template is valid at intake; when an equally specific All-employment template exists, it is preferred for the mixed batch.

### Stage 2 - Initial Checking - IMPLEMENTED

Initial Checking receives one batch task. The assigned personnel verify completeness, record or correct the Employment Classification for each item, may use bulk classification, and may place individual items on hold. Eligible items can be routed even when other items remain held.

For example, with five items, four verified items proceed to Stage 3 while one item remains **On Hold** in Initial Checking. A hold does not return the entire batch to Stage 2 or block its valid siblings.

### Item state, parallel groups, and progress - IMPLEMENTED

`PayrollItem` is the operational source of truth. A single batch can validly contain released, ready-for-release, Stage 3, and Stage 2/on-hold items at the same time. `PayrollBatch.progress` and its status labels are derived aggregates for display; they never control child-item routing. A batch becomes completed only when all of its current items reach the terminal Released state; cancellation rules are not implemented.

After Initial Checking, eligible items are routed by configured Employment Routing Rules:

| Employment classification | Stage 3 assignment |
| --- | --- |
| JOW/COS | Configured JOW/COS processor |
| Casual | Configured Casual processor |
| Regular | Configured Regular processor |

The resulting Work Groups are processing references to the original items, not duplicate records. A batch with 20 items remains one batch after it is split into, for example, 8 JOW/COS, 5 Casual, and 7 Regular items. Groups operate in parallel. Completing an assigned group item makes that item eligible for Release through the workflow engine; it does not manually advance the parent batch.

### Holds, compliance, and resumed items - IMPLEMENTED

An item may be held for Missing DTR, a missing signature or certification, incomplete or incorrect attachments, clarification, or another recorded reason. Other items continue independently.

When compliance arrives, the responsible desk records it, the item becomes ready for recheck, Initial Checking rechecks and confirms its classification, then routes that item to its configured Stage 3 processor. Already progressed siblings are unchanged. If the original classification Work Group is complete, the system can create a supplemental Work Group for the resumed item. The item stays in its original batch; it does not create a new batch.

**Current implementation note:** a Stage 3 exception is presently returned to Initial Checking for remediation. The intended business rule is that an on-hold item remains at the stage where the hold occurred; this Stage 3 behavior needs HRMDO review before it is changed.

### Release - IMPLEMENTED; physical partial-release policy pending

Release eligibility is determined per Payroll Item. A batch may therefore contain Released, Ready for Release, In Process, and On Hold items together. The application can release eligible items without waiting for unrelated items or groups.

**BUSINESS RULE PENDING HRMDO CONFIRMATION:** when four payroll items are ready for release and one is on hold, should physical release occur for the four ready items immediately, or should release wait for the final item? The software supports item-level readiness; the office must confirm the physical-release policy.

## Document Registry workflow

### Internal Processing - IMPLEMENTED

Workflow Templates define ordered internal phases and assign them to authorized HRMDO personnel, roles, or teams. Personnel complete their assigned business action and the workflow engine activates the next configured phase.

### External Handoff / Review and Return - IMPLEMENTED

An External Handoff / Review phase records temporary physical movement outside HRMDO, such as HRMDO Review -> City Mayor's Office for approval -> return to HRMDO -> continued internal processing -> final release. The external office is not a fake system user.

The system records destination office, purpose, representative, sent and expected-return times, physical location, return details, external result, and custody history. A template can set a fixed destination or require the office to be selected at handoff. On return, the authorized receiver records the event; the same Document ID and tracking number continue, physical location returns to HRMDO, the external phase completes, and the next internal phase activates. Supported recorded results include Approved, Approved with Comments, Returned with Comments, Signed, Reviewed, Disapproved, No Action, and Other.

**PLANNED:** result-based branching. Results are recorded today but do not choose different downstream routes automatically.

### Responsibility and custody

Workflow responsibility answers who inside HRMDO is responsible for work. Physical custody/location answers where the physical document is. They are intentionally separate: a document may be awaiting an external approval while its location is City Mayor's Office.

### Assignment configuration

**IMPLEMENTED:** personnel IDs are not hard-coded into routing logic. Workflow Templates configure intake, Initial Checking, internal phases, return receivers, and fixed versus handoff-selected external destinations. Employment Routing Rules configure the JOW/COS, Casual, and Regular Stage 3 processors.

## Security and authorization - IMPLEMENTED

Action authorization and view authorization are separate backend policies. The state API returns only records a user may view, including appropriately scoped audit data. Authorized viewers can include the current processor or team, prior processors, the encoder/docketing user, release personnel when a record reaches release, and authorized supervisors or administrators. Unrelated staff do not receive confidential document or payroll metadata, remarks, custody history, attachments, or audit detail.

Payroll Stage 3 processors receive their assigned items and the limited parent batch context needed for their Work Group; unrelated item detail is withheld. Attachment downloads resolve the owning Document, Payroll Item, Payroll Batch, or Leave Application and apply the same view policy. Knowing a file ID or URL grants no access. Upload attachment ownership is set only by an authorized record-processing action.

## Data model concepts

- **PayrollBatch** contains many **PayrollItems** and provides derived progress.
- **PayrollItem** owns its operational stage and status.
- **WorkGroup** references original PayrollItems for parallel Stage 3 processing.
- **WorkflowTemplate** defines configured phase order and assignments.
- **Document** owns registry metadata and its workflow snapshot.
- **Document custody/movement** records physical movement independently of workflow responsibility.
- **Audit/event history** records important state transitions.

## V1 migration and historical records

**PARTIAL - validation and preservation:** the installer can preserve/import existing legacy application-state collections, and the V1 Migration panel validates already imported historical document records and attachment integrity. It does not connect to, extract from, or complete a full external V1 SQL-to-V2 migration.

The intended migration priorities are Users, Leave Applications, Historical Documents, and Document Attachments; Communications should also migrate. Historical V1 Documents are read-only reference records that preserve available metadata, history, and attachments. They are not assigned new live V2 workflow phases merely because they were imported.

## Leave module status

Authorized HRMDO personnel register employee Leave Applications with structured leave details and one or more whole-day or half-day date ranges. The server calculates the total and controls the operational lifecycle: For Computation, Processing, For Signature, and Released. Stage-authorized personnel can place records on hold, record compliance, and resume at the held stage; supervisors can cancel active records without deleting their history. Released and cancelled records are read-only. A production leave-credit ledger remains outside the current scope.

## Existing XAMPP installation

Start Apache and MySQL, then run from the project directory:

```powershell
npm ci
php scripts/backup.php
php scripts/install.php
npm run lint
npm run build
php scripts/preflight.php
```

Open <http://localhost/hrmdo-document-tracking-system/>. The repeatable installer preserves accounts, imports the old `app_state` collections into individual database records, and retains the original snapshot. Accounts that previously existed only in the browser directory require an administrator to set a password in **Users & Designations**.

## Fresh deployment

1. Install PHP 8.2+ with `pdo_mysql`, `mbstring`, `fileinfo`, `Phar`, and `zlib`, MariaDB/MySQL, and Node.js 22+ for builds/tests.
2. Copy `api/config.example.php` to `api/config.php` and set database credentials. Installation requires CREATE privileges. Keep credentials out of source control.
3. Supply the first administrator; there is no shipped default password:

   ```powershell
   $env:HRMDO_ADMIN_EMAIL = 'administrator@example.org'
   $adminSecret = Read-Host 'Administrator password (12-72 bytes)' -AsSecureString
   $env:HRMDO_ADMIN_PASSWORD = [System.Net.NetworkCredential]::new('', $adminSecret).Password
   php scripts/install.php
   Remove-Item Env:HRMDO_ADMIN_PASSWORD
   npm ci
   npm run build
   php scripts/preflight.php
   ```

4. For runtime, use a dedicated account with SELECT, INSERT, UPDATE, and DELETE on this application's tables. Runtime requests never create tables, databases, or default users.
5. Enable Apache `mod_rewrite`, `mod_headers`, and `AllowOverride All`. If another application intercepts the URL, use `deployment/apache-xampp.conf` before its catch-all rule. Deploy the root, API, and storage `.htaccess` files: they protect source, configuration, scripts, uploads, and backups.
6. Configure HTTPS on the deployment host. Verify `/api/config.php`, `/storage/backups/`, and `/.env.example` return 403. Restrict phpMyAdmin and MySQL access on that host. Change any existing local administrator password before wider deployment.
7. Set PHP `upload_max_filesize = 10M`, `post_max_size = 12M`, and `display_errors = Off`. Point `upload_directory` to a private writable directory, preferably outside Apache's document root. Files upload individually.

Uploads support PDF, JPEG, PNG, TXT, CSV, DOCX, and XLSX up to 10 MB each. The API checks content types and Office archive structure, assigns random storage names, records SHA-256 digests and ownership, and authenticates downloads. Filename-only attachments from the prototype retain their metadata; recover their original bytes before treating them as downloadable or verified files.

## Configure before staff intake

1. **Users & Designations:** create officers with initial passwords and assign roles. Every officer signs in separately. Password changes invalidate other sessions; inactive sessions expire after 30 minutes.
2. **Classification Catalogue:** review the four baseline classifications and active types. Add/edit descriptions and SLA hours; disable retired types. Existing documents retain their original classification.
3. **Workflow Engine:** create active workflows for classification/type pairs, or use `All`/`Default` for a classification-wide route. Payroll employment-specific workflows take precedence. Internal Processing steps are assigned to officers, roles, or teams matching users' division/office. An External Handoff / Review step records an external office as custody, a purpose, a return receiver, turnaround, and return requirements; it never creates an external user task. The document pauses outside HRMDO until the configured receiver records its return, then the next internal step starts automatically. Final Release must come last. Updates are versioned; existing documents retain saved workflow steps.
4. **Payroll Management -> Employment Routing Rules:** assign a processor for each employment classification. Single payroll uses its matching workflow and employment processor. Payroll batch Docketing assigns the batch to the configured Initial Checking desk; that desk classifies items and can route eligible items while held siblings remain in Initial Checking. Work groups process only their assigned items, which can become ready for release independently.
5. Verify the configured officers can perform intake, processing, return, approval, download, and release. Approval/release require corresponding permission and valid workflow stage. An officer cannot approve their own leave.

## Backups and recovery

`php scripts/backup.php` writes a consistent database snapshot under `storage/backups/`. Backups contain staff records and password hashes: restrict access and copy them off the deployment machine. Back up the configured upload directory too. Schedule both according to the office's recovery requirements.

To test recovery, configure an **empty** database and restore a trusted application backup:

```powershell
$env:HRMDO_DATABASE = 'hrmdo_recovery'
php scripts/restore.php 'C:/private-backups/hrmdo-backup.json'
Remove-Item Env:HRMDO_DATABASE
```

Restore matching uploaded files and verify records before admitting staff. Restore refuses to overwrite an existing database. For deployment rollback, restore the pre-deployment backup/files into a separate instance and deploy the matching application version.

The historical archive reports actual imported records and attachment exceptions. Source equivalence requires original V1 data and checksums; the application does not claim a connection to an unconfigured external V1 database.

## Development and verification

Copy `.env.example` to `.env.local` to change URL paths. Vite loads these values for builds and proxies API requests to Apache in development. The frontend and API must share an origin.

```powershell
npm run dev
npm run lint
npm test
npm run build
npm run test:ui
php scripts/preflight.php
```

When editing the application while using the Apache URL (`http://localhost/hrmdo-document-tracking-system/`), run `npm run build:watch` in a separate terminal. It rebuilds the `dist` folder after each change, so a browser refresh loads the updated interface. Edit files under `src`; `dist/assets/index-*.js` is generated output and is replaced on every build.

Integration tests create/remove isolated `hrmdo_test_*` databases; their account needs CREATE/DROP privileges. Browser tests use installed Edge by default. Elsewhere, run `npx playwright install chromium` and set `PLAYWRIGHT_CHANNEL=chromium`.

Tests cover permissions, catalogue/workflows, documents, conflicts, payroll, leave, files, audit attribution, credential revocation, and backup recovery. Browser checks cover configuration, registration, reload persistence, screen rendering, and visible save failures.

The interface loads the operational registry into memory and refreshes every 30 seconds. Load-test representative volumes before a large rollout; pagination and archival policies may be needed. Database failures block mutations and display errors; there is no browser-storage fallback.
