# Monthly salary command

The salary job is a local authenticated command, not a public HTTP endpoint.

Configure `DATABASE_URL` and `SALARY_JOB_ACTOR_LOGIN_ID`. The actor must be an active Super Admin so every salary record has an auditable performer.

Run manually:

```sh
npm run salary:calculate -- --month=7 --year=2026
```

Example Linux cron (run at 02:15 on the first day of each month for the previous month through a wrapper that supplies the numeric month/year):

```cron
15 2 1 * * cd /opt/smarthazri/BackendCode && /opt/smarthazri/bin/calculate-previous-month.sh >> /var/log/smarthazri-salary.log 2>&1
```

The wrapper should call the command above with explicit `--month` and `--year`. Keep the backend directory and environment file readable only by the service account. Use a scheduler-level lock such as `flock`; duplicate execution is nevertheless safe because the database upserts the unique `(teacherId, month, year)` record.

Windows Task Scheduler can run `npm.cmd run salary:calculate -- --month=<month> --year=<year>` under the backend service account. Generate explicit month/year arguments in a restricted PowerShell wrapper and store its output in protected logs.
