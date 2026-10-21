# Leave details autocomplete

## Architecture and scope

`LeaveContinuity.tsx` already shares one intake form between new Leave Applications and editing. Vacation and Special Privilege Leave use the existing location subtype selector; Sick Leave uses the medical-setting selector. The form stores the text in `leaveDetails`. Server validation in `domain.php` preserves the 2,000-character limit and subtype requirements. Existing application writes, workflow audits and resource refreshes continue through `state.php` and AppContext. Registry and detail reads remain unchanged; EWP has its own intake controls.

Suggestions are independent records in `leave_suggestions`, outside `app_records` and the normalized document/workflow tables. Autocomplete requests do not load full application state. Saving a suggestion does not submit an application or alter the global state revision. Existing destination fields are imported once with a CLI backfill. Application registration and editing in `state.php` now update the suggestion vocabulary within the existing transaction through `leave_suggestion_history.php`. No changes were needed in `types.ts`, `http.ts`, `domain.php`, or the leave detail endpoint.

## Deployment

1. Back up the installation using its usual backup procedure.
2. With the existing application's database configuration/environment, run:

   ```powershell
   php scripts/migrate_leave_suggestions.php
   php scripts/backfill_leave_suggestions.php
   ```

   This CLI-only, repeatable migration executes only `CREATE TABLE IF NOT EXISTS` from `database/leave_suggestions.sql`. It neither reads historical leave records nor modifies existing tables. The regular installer also includes this table for new installations. The feature migration has been exercised against isolated test databases and was applied to the configured local installation on 2026-10-14 when resolving the Apache 403 deployment issue.

   The separate repeatable backfill reads only the relevant field projections from existing `app_records` leave entries in batches of 500, deduplicates them into `leave_suggestions`, and never changes the source records. It prints only an added-row count. Search requests continue to query the indexed suggestion table, rather than historical applications. Future application registration/editing adds eligible values automatically, without a separate Enter-to-save step.

3. Run `npm run build` and deploy the generated frontend alongside the new PHP endpoint and existing backend. Deploy the migration and backfill before enabling the updated frontend.

The table uses InnoDB and utf8mb4, with timestamps, a scoped uniqueness constraint, and an index for scoped prefix searches. Both categories are now shared among authorized Leave users, as requested in the subsequent clarification: medical entries use the fixed `__shared_medical__` scope and destinations use an empty scope. The fixed non-empty medical scope preserves compatibility with the existing table constraint, so no schema alteration is needed. A SHA-256 hash of the normalized value permits a unique key while preserving the entire 2,000-character value. The database resolves competing inserts atomically; subsequent requests reuse the first saved display spelling. A successful insert and its audit event commit together.

## API and authorization

`GET api/leave_suggestions.php?category=medical&q=fev` searches the shared Sick Leave vocabulary. `category=destination` searches the separate shared destination vocabulary. Optional `locationType` accepts `WITHIN_PHILIPPINES` or `ABROAD` for destinations. Omitting `q` retrieves at most eight permitted saved terms. The response contains only `items: [{id, value}]`.

`POST api/leave_suggestions.php` accepts JSON `{category, value, locationType?}` and returns `{item: {id, value}, created}`. Authentication, CSRF validation, JSON parsing and errors reuse the existing PHP helpers. Reading follows existing Leave access policy. Writing requires the same intake capability and Leave module access used for registering/editing applications. Caller-supplied owner or visibility fields cannot change server-derived scope.

The server rejects invalid categories/location types, non-string values, values over 2,000 characters, empty/whitespace-only registrations, control/formatting characters, and values without letters or numbers. Whitespace (including line breaks) is collapsed for saved vocabulary entries. Case-insensitive duplicates return the existing spelling. Free-text application details remain independently supported, including newlines, without registering a suggestion.

## Interaction and ranking

The field is an accessible textarea combobox in Sick, Vacation and Special Privilege Leave only, in both create and edit mode. The original subtype dropdowns remain unchanged.

- Arrow Down/Up highlights suggestions; Enter selects the highlight.
- Enter without a highlight registers the current text, or reuses an exact normalized match. The dropdown also offers a clickable **Save suggestion** action for new terms. Empty input does nothing. Repeated Enter during an active save does not send another registration. The visible helper paragraph beneath the field has been removed; keyboard instructions remain available through its accessible description.
- Enter is intercepted before form submission. Shift+Enter inserts a newline. Tab moves normally. Escape, outside interaction and selection close the dropdown.
- Saving retains the value and form, with a small success message. Errors retain the text and allow Enter to retry. Changes in text, category or subtype invalidate stale results/feedback.
- Searches debounce for 250 ms, abort superseded requests, and guard against late responses. Results are limited to eight. Exact matches rank first, then prefixes, then substrings. Within each rank, an explicitly supplied location type is preferred, followed by shorter terms and deterministic normalized spelling/ID ordering. Prefix lookups use the scoped prefix index; substring fallback scans only the permitted vocabulary when the prefix list is incomplete. SQL wildcard characters in input are literal.
- The portal dropdown uses theme variables, follows window/modal scrolling and textarea resizing, and fits above or below the input according to viewport space. Mouse, touch and keyboard selection are supported.

## Access and limitations

The user explicitly superseded the original private/administrator-approved medical vocabulary requirement. Sick Leave terms are now shared among accounts authorized to access Leave, just like destinations; there is no per-encoder restriction or approval step. Historical Sick Leave values are imported regardless of employee/encoder account links. New application saves, edits and Enter registrations populate the same shared medical vocabulary. Search responses contain no applicant identities, leave application IDs or source-record metadata. Authentication, Leave-module authorization and write capabilities remain enforced. The system retrieves stored text only; it does not infer diagnoses.

Run `php scripts/backfill_leave_suggestions.php` after deploying this change. It also copies terms previously saved under account-specific scopes into the shared medical scope, deduplicating by normalized value. Old suggestion rows remain intact for preservation but are no longer queried by the interface. Original leave applications are not modified or duplicated.

Destinations from existing Vacation and Special Privilege Leave entries are imported into the shared vocabulary. The same projection runs for future registration/editing. Only single-line destination fields up to 190 characters, containing place-name characters, are eligible for automatic reuse; email/contact-like values, long numeric sequences, multiline narratives, blank values and unrelated leave types are skipped. These structural filters do not establish that arbitrary user-written text is non-confidential; destination fields should contain places only. Explicit Enter/dropdown registration still supports the existing 2,000-character limit. Only non-confidential destinations should be registered. Location preference uses only the source's explicit subtype on first registration; unknown locations remain unclassified and duplicate spelling/classification is retained. No geographic inference is performed. For example, a historical `Cebu` destination becomes searchable with `CEB` immediately after backfill, without re-entering or saving it manually. No employee names or leave IDs are copied to suggestion responses.

Suggestion audits record only category/visibility and the suggestion ID, never its text or a leave application ID. They do not emit a leave-submitted audit event. Suggestion data is not added to full-state responses or cross-user browser storage. A small component-local cache retains at most 20 queries for five seconds, clears after saving, and is discarded on account/type/subtype changes or modal closure. There is no persistent browser cache; searches use the authenticated endpoint. Database persistence survives browser sessions and application/XAMPP restarts. Cancelling the application intentionally leaves independently saved suggestions available.

## Changed files and validation

Added: `api/leave_suggestions.php`, `api/leave_suggestion_history.php`, `database/leave_suggestions.sql`, `scripts/migrate_leave_suggestions.php`, `scripts/backfill_leave_suggestions.php`, `src/components/LeaveDetailsAutocomplete.tsx`, `tests/leave-suggestions.test.mjs`, `tests/ui/leave-suggestions.spec.ts`, and this document.

Updated: `src/components/LeaveContinuity.tsx`, `src/services/leaveApi.ts`, `api/state.php`, `scripts/install.php`, `api/.htaccess`, and the isolated test router `tests/router.php`. The Apache API allowlist must include `leave_suggestions.php`; otherwise Apache rejects the request with an HTML 403 before PHP authentication runs. Internal history-projection helpers remain blocked from direct web access. The regression suite checks this allowlist and confirms that internal helpers remain denied.

Run these checks against the existing isolated test fixtures (which create uniquely named temporary databases):

```powershell
node --test tests/leave-suggestions.test.mjs tests/integration.test.mjs tests/phase10-operational-api.test.mjs
npx playwright test tests/ui/leave-suggestions.spec.ts tests/ui/leave-ewp.spec.ts
php -l api/leave_suggestions.php
php -l scripts/migrate_leave_suggestions.php
php -l scripts/install.php
php -l tests/router.php
npm run lint
npm run build
```

The API suite covers case/whitespace normalization, exact/prefix/substring ranking, one-character input, result bounds, literal SQL wildcard input, invalid and long input, shared medical/destination vocabulary across authorized accounts, duplicate and competing registrations, session persistence, repeatable migration, metadata-only responses/audits, CSRF, permissions, and application creation/editing. Browser tests cover cross-account medical suggestions, historical entries, activation, keyboard/mouse/touch use, Enter without submission even with a complete application, retry, stale responses, refresh persistence, registration/editing, and mobile portal positioning during modal scrolling. The existing Leave/EWP browser suite checks unchanged EWP intake and calendar behavior.

The earlier validation notes below describe previous iterations, including the superseded private-medical behavior.

Initial validation on 2026-10-14: the new API test plus 28 existing integration/operational tests passed. All four PHP syntax checks, TypeScript lint and the production build passed. The build reports warnings about the existing theme-bootstrap script and bundle size. Existing Leave/EWP and autocomplete browser tests passed. A mobile screenshot was visually inspected. Direct Apache checks confirm the suggestion endpoint reaches PHP authentication (JSON 401 for an anonymous request) while `db.php` remains blocked (HTML 403).

Historical-entry integration on 2026-10-14: all three suggestion API/deployment tests and all 26 existing integration tests passed. The history regression covers historical Cebu matching without Enter registration, normalization and deduplication, repeatable import, excluded invalid/contact/multiline entries, per-employee medical privacy (including protection from encoder access), and automatic updates after future application registration/editing. PHP syntax checks passed for the projection helper, backfill script and modified state endpoint. The backfill was applied to the configured installation and added 21 eligible suggestions; two destination suggestions now match the `ceb` prefix. Existing leave applications were not modified.

Sick Leave history extension on 2026-10-14: the configured installation has 294 historical Sick Leave entries with encoder references and no employee-account links. The private encoder-history fallback imported 88 medical suggestions (deduplicated within each account). All three suggestion backend tests and the dedicated historical Sick Leave browser test passed. Tests cover immediate search after registration/editing without pressing Enter, import idempotency, private encoder fallback, exclusion of records with no account reference, and continued employee-first privacy when an explicit employee link exists. Original leave applications were not modified.

Account-scope investigation: all 88 imported medical suggestions belong to one HR account; administrator accounts have no medical suggestions. Their absence in another account is the configured privacy filter, not a failed import. The empty medical dropdown now explicitly says that the current account has no saved medical suggestions. TypeScript lint and the production build passed. Cross-account sharing remains disabled pending a decision about the administrator-approved generic vocabulary required by the original privacy specification.

Shared Sick Leave update (current behavior): the user superseded the private/approval requirement. Medical search, Enter registration and automatic leave-history projection now use a shared medical scope. The applied backfill added 88 shared medical terms without deleting previous suggestion rows or changing original applications. A count-only database check confirmed a stored term matches the `con` prefix. All 29 backend regression tests, all eight autocomplete browser tests, PHP syntax checks, TypeScript lint and production build passed. The browser tests explicitly verify an administrator selecting a Sick Leave term entered by another authorized account. Accounts without Leave access and anonymous callers remain denied; medical and destination terms remain separate. The account-specific empty message was removed.
