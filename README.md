# SmartHazri Backend

Production-oriented REST API foundation for the SmartHazri Madarsa Management app.
It uses Node.js, Express, MySQL, Prisma, JWT, and bcrypt. Business modules are
intentionally empty until their dedicated implementation prompts.

## Requirements

- Node.js 20 or newer
- MySQL 8

## Setup

```sh
copy .env.example .env
npm install
npm run prisma:generate
```

Create the database and a restricted MySQL application user, then update
`DATABASE_URL`. Replace both JWT secrets with different cryptographically random
values of at least 32 characters. Never commit `.env`.

## Database and seed

Development migration:

```sh
npm run prisma:migrate -- --name initial_foundation
```

Deploy committed migrations in production:

```sh
npm run prisma:deploy
```

Seed or update the initial Super Admin from `.env`:

```sh
npm run prisma:seed
```

The seed hashes `SUPER_ADMIN_PASSWORD` with bcrypt before storage and never stores
or prints the plaintext password.

## Run and verify

```sh
npm run dev
curl http://localhost:4000/api/health
```

Expected response:

```json
{"success":true,"message":"API is running"}
```

Production:

```sh
npm start
```

Tests:

```sh
npm test
```

The process handles `SIGINT` and `SIGTERM`, closes the HTTP server, and disconnects
Prisma before exit. All backend timestamps are stored in UTC; business dates will
use `APP_TIMEZONE` when their modules are implemented.

## Database model

The `20260803000200_madarsa_management_schema` migration expands the foundation
with branches, classes, students, Teacher attendance, reports, leave requests,
payroll settings, salaries, attendance corrections, and audit logs.

Important guarantees:

- `login_id`, non-null email, legacy Firebase UID, branch code, and admission
  number are unique. MySQL permits multiple `NULL` values in nullable unique fields.
- A class name is normalized by the service layer and unique within its branch by
  `(branch_id, normalized_name)`; the same display name may exist in another branch.
- A Teacher can reference one branch and one class. Services must verify that the
  selected class belongs to the selected branch before writing.
- Attendance is unique per `(teacher_id, attendance_date)`. Attendance dates use
  the configured institution timezone; timestamp columns are UTC.
- Reports snapshot Teacher/branch/class context and are unique per Teacher, type,
  and reporting period.
- Leave, attendance, reports, salaries, and corrections keep assignment snapshots
  so later Teacher reassignment does not rewrite history.
- Salary is unique per `(teacher_id, month, year)` and snapshots branch/class.
- Monetary values use `DECIMAL(12,2)` and must never be calculated with JavaScript
  floating-point arithmetic.
- Historical foreign keys use `RESTRICT`; application modules must use soft status
  changes instead of deleting referenced records. Only refresh-token sessions use
  cascade deletion with their owning User.
- JSON report content, calculation breakdowns, correction before/after snapshots,
  and audit metadata keep their schemas extensible; services remain responsible
  for validating their structure.

## Authentication API

There is no public signup, forgot-password email, or OTP recovery endpoint.
Teachers who lose their password must contact their Super Admin.

```text
POST  /api/auth/login
POST  /api/auth/refresh
POST  /api/auth/logout
GET   /api/auth/me
PATCH /api/auth/change-password
```

Login accepts `loginId` and `password`. Login IDs are trimmed and normalized to
lowercase. Successful login and refresh return a safe profile plus access and
refresh tokens. JWT claims include backend-issued `userId`, `role`, and token
type; client-supplied roles are ignored.

Send the access token on protected routes:

```http
Authorization: Bearer ACCESS_TOKEN
```

Refresh and logout accept `{ "refreshToken": "..." }`. Only a SHA-256 hash of
each refresh token is stored. Refresh rotates it atomically, logout revokes it,
and password change revokes every active refresh session for that User. Password
change also increments `token_version`; middleware rejects all previously issued
access JWTs immediately instead of waiting for their normal expiry.

Change password accepts:

```json
{
  "currentPassword": "CurrentPassword1",
  "newPassword": "NewPassword2",
  "confirmPassword": "NewPassword2"
}
```

The authentication middleware verifies the access JWT, then reloads current role
and status from MySQL. Deactivated accounts therefore lose protected API access
without trusting role/status values from the mobile client.
