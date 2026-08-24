# One-time Firebase to MySQL migration

This tool is backend-only and uses Firebase Admin SDK. It never runs from the mobile app or server startup. Dry-run is the default.

## 1. Back up before migration

1. Export Firebase Authentication users and create a Firestore managed export from Google Cloud.
2. Back up MySQL with a transaction-consistent dump:

```sh
mysqldump --single-transaction --routines --triggers --databases smart_hazri > backups/pre-firebase-migration.sql
```

3. Copy `src/migrations/firebase-mapping.example.json` to `src/migrations/firebase-mapping.json`. Map only known Firebase branch/class IDs to existing MySQL IDs. Unmapped assignments remain null; the script never creates branches or classes.
4. Download a Firebase service-account JSON outside the repository. Set `FIREBASE_SERVICE_ACCOUNT_PATH` or pass `--service-account=<absolute path>`. Never commit it.

## 2. Dry-run

```sh
npm run migrate:firebase:dry-run -- --service-account=/secure/firebase.json --mapping=src/migrations/firebase-mapping.json
```

The JSON report is written under ignored `migration-reports/` and contains per-section Scanned, Imported, Skipped, Duplicates and Errors totals, warnings, and no credentials or password material. Review every warning/error before continuing.

Collections default to `users` and `daily_attendance`; override them in the mapping file. Use `--timezone=Asia/Karachi` if needed. Timestamps become JavaScript UTC instants and are stored in MySQL UTC columns.

## 3. Execute explicitly

```sh
npm run migrate:firebase -- --service-account=/secure/firebase.json --mapping=src/migrations/firebase-mapping.json
```

Execution requires the script's confirmation token. It imports profiles as `INACTIVE` with a cryptographically random unknown password hash. Firebase hashes are not copied. `company_admin` maps to `SUPER_ADMIN`; `employee` maps to `TEACHER`. The Super Admin must use the existing Teacher password reset workflow, verify assignment, and activate each Teacher.

User names/contact and other user-entered strings are copied without translation. Existing MySQL users are not overwritten. Conflicting UID/login/email records are reported as duplicates for manual resolution.

Attendance keeps check-in/check-out instants in UTC, stores the Firestore document ID in `legacyFirebaseId`, and respects the unique `(teacherId, attendanceDate)` constraint. Conflicts are reported and not overwritten.

## Rollback

Preferred rollback is restoring the full pre-migration MySQL dump into a clean database and switching the application back only after validation.

For an isolated migration with no subsequent writes, the report lists created MySQL user and attendance IDs. A database administrator may delete those exact attendance IDs first, then exact user IDs, inside a manually reviewed transaction. Never use broad role/date deletes. Restore the pre-migration dump if any downstream rows reference imported users.

The tool intentionally has no automatic rollback or destructive cleanup command.
