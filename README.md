# HRMDO Document Tracking System

A production-ready document registry, payroll workflow, and leave-management application for HRMDO operations. The system combines a React + Vite frontend with a PHP 8.2+ API and MariaDB/MySQL persistence, and is designed to run behind Apache in a standard XAMPP or Linux hosting environment.

## Overview

This application supports the operational lifecycle for:

- Document registration and tracking
- Internal workflow routing and external handoff review
- Payroll intake, batch processing, item-level routing, and release
- Leave application processing and approval
- Role-based authorization, attachments, audit trail, and backups
- Historical record preservation and V1 migration validation

The current build is intended for deployment use, with the core business workflows stabilized and the operational safeguards in place for staff intake and production use.

## Core features

### Document registry

- Register and track documents with document IDs, tracking numbers, and workflow state
- Configure internal workflow templates with ordered processing phases
- Support external office handoff, custody tracking, and return processing
- Record physical movement separately from internal responsibility
- Maintain audit history for state changes and operational actions

### Payroll processing

- Register payroll batches and individual payroll items
- Support initial checking, item classification, and parallel stage processing
- Route eligible items independently while held siblings remain in place
- Configure employment-based processing rules for JOW/COS, Casual, and Regular classifications
- Support item-level release readiness and grouped stage processing without blocking unrelated work

### Leave management

- Register employee leave applications with structured date ranges and totals
- Enforce stage-based lifecycle handling and authorization rules
- Support holds, compliance, resume flows, and supervisor cancellation
- Prevent unauthorized self-approval and restrict release/cancel actions to authorized roles

### Security, visibility, and control

- Separate action authorization from view authorization
- Restrict record visibility based on current role, assignment, and processing context
- Apply the same access policy to attachment downloads and file ownership
- Reject stale mutations with conflict checks and audit-backed record updates

### Administration and operations

- Role and team assignment management
- Classification catalogue configuration
- Workflow template versioning and assignment configuration
- Backup and restore workflows for database and uploaded files
- Preflight validation for deployment readiness

## Technology stack

- Frontend: React, TypeScript, Vite
- API: PHP 8.2+
- Database: MariaDB/MySQL
- Web server: Apache
- Build tooling: Node.js 22+

## Production deployment requirements

### Required software

- PHP 8.2 or newer with modules:
  - `pdo_mysql`
  - `mbstring`
  - `fileinfo`
  - `Phar`
  - `zlib`
- MariaDB or MySQL
- Node.js 22+
- Apache with `mod_rewrite`, `mod_headers`, and `AllowOverride All`

### Recommended deployment settings

- Use HTTPS in front of the application
- Store the application config outside the web root
- Keep upload storage in a private writable directory outside the Apache document root
- Set PHP values such as:
  - `upload_max_filesize = 10M`
  - `post_max_size = 12M`
  - `display_errors = Off`

## Installation

1. Clone or copy the application into the Apache document root or hosting directory.
2. Install frontend dependencies:

   ```powershell
   npm ci
   ```

3. Copy the example configuration file and set the database credentials:

   ```powershell
   copy api\config.example.php api\config.php
   ```

4. Create the first administrator account during install:

   ```powershell
   $env:HRMDO_ADMIN_EMAIL = 'administrator@example.org'
   $adminSecret = Read-Host 'Administrator password (12-72 bytes)' -AsSecureString
   $env:HRMDO_ADMIN_PASSWORD = [System.Net.NetworkCredential]::new('', $adminSecret).Password
   php scripts/install.php
   Remove-Item Env:HRMDO_ADMIN_PASSWORD
   ```

5. Build the frontend assets:

   ```powershell
   npm run build
   ```

6. Run the deployment readiness check:

   ```powershell
   php scripts/preflight.php
   ```

7. Open the app at the configured host, typically:

   ```text
   http://localhost/hrmdorms/
   ```

## Configuration checklist before staff use

1. Create officers and assign roles in Users & Designations.
2. Review the Classification Catalogue and activate the appropriate classifications and types.
3. Configure workflow templates for the business routes your office uses.
4. Set Employment Routing Rules for payroll processing.
5. Verify staff can access the screens and actions required for their duties.
6. Ensure uploads, permissions, and audit tracking are active in the target environment.

## Operational notes

- The installer preserves existing accounts and can import legacy state into the new schema.
- Runtime accounts should be restricted to the minimum database privileges needed for the application.
- Database failures block changes and surface errors to the user instead of silently continuing.
- The interface refreshes operational registry data periodically, and the application assumes a consistent backend environment.

## Backup and restore

Create a database backup with:

```powershell
php scripts/backup.php
```

The backup is stored under the application storage folder and should be copied to an external secure location. Upload storage should also be backed up independently.

To restore a trusted backup into a clean database:

```powershell
$env:HRMDO_DATABASE = 'hrmdo_recovery'
php scripts/restore.php 'C:/private-backups/hrmdo-backup.json'
Remove-Item Env:HRMDO_DATABASE
```

## Verification commands

Use the project verification scripts during setup and after changes:

```powershell
npm run lint
npm run build
npm test
npm run test:ui
php scripts/preflight.php
```

## Security recommendations

- Keep configuration files out of source control.
- Restrict access to backups and uploaded files.
- Use HTTPS for production traffic.
- Avoid storing administrator secrets in the repository, shell history, or browser storage.
- Review role assignments and workflow permissions before wider deployment.

## Project status

The application is structured for production deployment and is suitable for operational use in a secured hosting environment after the required configuration and staff setup steps are completed.

## Laravel evolution

The `backend/` directory contains an additive Laravel 12 API scaffold. It currently runs beside the existing PHP API and exposes a health check at `/api/health`; it does not yet handle production traffic or replace the existing endpoints. The migration is intentionally incremental so the React/Vite frontend, MariaDB data, JSON record payloads, sessions, authorization rules, uploads, and rollback path can be validated one capability at a time.

To verify the scaffold from its directory:

```powershell
cd backend
php artisan about
php artisan route:list --path=api
php artisan test
```

Do not point `VITE_API_URL` at the Laravel backend until the compatibility layer and contract tests for the selected capability are complete.

## License

This project is intended for internal operational use by the deploying office. Review the repository policy and local procurement guidance before broader public distribution.
