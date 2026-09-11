# HRMDO Document Tracking System

React/Vite interface, PHP 8.2+ API, and MariaDB/MySQL persistence. Apache serves the production build. The server validates each named operation and commits affected records and audit events together. Stale operations receive HTTP 409 rather than overwriting another officer's changes.

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
   $adminSecret = Read-Host 'Administrator password (12–72 bytes)' -AsSecureString
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
4. **Payroll Management → Employment Routing Rules:** assign a processor for each employment classification. Single payroll uses its matching workflow and employment processor. Batch intake is assigned to its receiving officer; every item must be verified and free of exceptions before work-group routing. All work groups must finish before release.
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
