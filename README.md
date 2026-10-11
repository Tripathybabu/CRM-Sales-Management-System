# CRM Sales Management System — Backend API

A production-style REST API for managing a company's complete sales process:

```
Lead generation → Lead qualification → Customer conversion → Deal management → Deal closure
```

Built with **Node.js, Express, MongoDB (Mongoose)**, with JWT authentication, role-based and record-level authorization, transactional lead conversion, a deal-stage state machine, an audit timeline, and aggregation-based sales analytics.

| | |
|---|---|
| **API base URL** | `http://localhost:5000/api/v1` |
| **Swagger UI** | `http://localhost:5000/api-docs` (raw spec: `/api-docs.json`) |
| **Postman collection** | [`docs/postman/CRM-Sales-Management.postman_collection.json`](docs/postman/CRM-Sales-Management.postman_collection.json) |
| **Database design** | [`docs/DATABASE_DESIGN.md`](docs/DATABASE_DESIGN.md) |
| **Sample requests / responses** | [`docs/API_EXAMPLES.md`](docs/API_EXAMPLES.md) |
| **Deployed link** | _add your Render/Railway URL here after deploying (see [Deployment](#deployment))_ |

---

## Table of contents

1. [Features](#features)
2. [Tech stack](#tech-stack)
3. [Project structure](#project-structure)
4. [Getting started](#getting-started)
5. [Environment variables](#environment-variables)
6. [Authentication](#authentication)
7. [Roles & permissions](#roles--permissions)
8. [API overview](#api-overview)
9. [Business rules](#business-rules)
10. [Database & indexing decisions](#database--indexing-decisions)
11. [Security](#security)
12. [Error handling & response format](#error-handling--response-format)
13. [Testing](#testing)
14. [Deployment](#deployment)
15. [Assumptions](#assumptions)

---

## Features

- **Auth**: register, login, logout, logout-all, refresh-token rotation with reuse detection, profile, change password, account lockout.
- **Users**: admin CRUD, activate/deactivate, manager ↔ executive teams, search/filter/sort/paginate.
- **Leads**: CRUD, status state machine, assignment/reassignment, multi-filter search with date ranges.
- **Lead conversion**: qualified lead → customer (+ optional deal) in a **MongoDB transaction**, race-safe, exactly once.
- **Customers**: CRUD, assignment, lineage to the original lead and its deals.
- **Deals**: CRUD, server-computed expected revenue, stage state machine (won/lost/reopen rules), assignment.
- **Activities**: calls, emails, meetings, demos, follow-ups, reminders, notes; server-derived `overdue` status.
- **Timeline / audit log**: every important change, with previous/new values, retrievable per lead, customer or deal.
- **Analytics**: KPI summary, sales pipeline by stage, team performance, monthly revenue trend (aggregation pipelines).
- **CRM configuration**: admin-managed stage probabilities, default currency, close-date horizon.
- **Docs & quality**: OpenAPI 3 + Swagger UI, generated Postman collection, 58 integration tests against a real replica set.

## Tech stack

| Concern | Choice |
|---|---|
| Runtime / framework | Node.js ≥ 20, Express 4 |
| Database | MongoDB ≥ 6 (replica set), Mongoose 8 |
| Validation | Zod (strict schemas, coercion, normalisation) |
| Auth | JWT (HS256) access tokens + opaque rotating refresh tokens (httpOnly cookie), bcrypt |
| Security | helmet, CORS whitelist, express-rate-limit, NoSQL-injection sanitising, request IDs |
| Logging | pino / pino-http with secret redaction |
| Docs | OpenAPI 3.0 + swagger-ui-express, Postman v2.1 (generated) |
| Tests | Jest, Supertest, mongodb-memory-server (replica set) |
| Tooling | ESLint 9, Prettier, Docker, docker-compose, Render blueprint |

## Project structure

```
src/
├── app.js                 # Express app: security middleware, docs, routes, error handling
├── server.js              # Bootstrap: DB connection, HTTP server, graceful shutdown
├── config/                # env validation (Zod), logger, database connection
├── constants/             # roles, enums, status transitions, timeline actions
├── models/                # Mongoose schemas + indexes
├── validators/            # Zod request schemas (params / query / body)
├── middleware/            # authenticate, authorize, validate, sanitize, rate limiters, errors
├── services/              # business logic (access scopes, conversion, deal rules, analytics…)
├── controllers/           # thin HTTP adapters: req → service → consistent response
├── routes/                # route definitions + per-route middleware chains
├── docs/openapi.js        # OpenAPI 3 specification
└── utils/                 # AppError, pagination/query helpers, transactions, responses
scripts/
├── seed.js                # demo data through the service layer
└── generate-postman.js    # Postman collection from the OpenAPI spec
tests/                     # integration tests (Jest + Supertest + in-memory replica set)
docs/                      # database design, API examples, Postman collection
```

**Layering:** `route → validate → controller → service → model`. Controllers contain no business logic; services never touch `req`/`res`; every rule lives in exactly one service function, so the API, the seed script and tests share the same behaviour.

## Getting started

### Prerequisites

- Node.js **20+** and npm
- MongoDB **running as a replica set** — transactions are used for lead conversion and for every "change + audit entry" write. Options:
  - **Docker** (easiest): `docker compose up -d mongo` → single-node replica set on `localhost:27017`
  - **MongoDB Atlas** (free tier is a replica set) → use its `mongodb+srv://…` URI
  - **Local mongod service**: add `replication: { replSetName: rs0 }` to `mongod.cfg`, restart, then run `mongosh --eval "rs.initiate()"` once

### Installation

```bash
git clone https://github.com/Tripathybabu/CRM-Sales-Management-System.git
cd CRM-Sales-Management-System
npm install
cp .env.example .env        # then set JWT_ACCESS_SECRET and MONGODB_URI
```

Generate a secret:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

### Database setup

```bash
docker compose up -d mongo   # skip if you use Atlas or your own replica set
npm run seed                 # creates indexes + demo organisation (idempotent)
npm run seed:fresh           # wipe CRM collections and re-seed (refused in production)
```

The seed creates 1 admin, 2 managers, 4 executives (2 per team), 12 leads across all statuses, 5 conversions with deals (won / lost / open), notes, follow-ups, meetings and one overdue task — all through the service layer, so the timeline is fully populated.

| Role | Email | Password |
|---|---|---|
| admin | `admin@crm.dev` | `Admin@12345` |
| sales_manager | `maya.manager@crm.dev` (team: Esha, Arjun) | `Passw0rd!` |
| sales_manager | `sam.manager@crm.dev` (team: Nina, Omar) | `Passw0rd!` |
| sales_executive | `esha.exec@crm.dev`, `arjun.exec@crm.dev`, `nina.exec@crm.dev`, `omar.exec@crm.dev` | `Passw0rd!` |

### Run the server

```bash
npm run dev      # nodemon, pretty logs
npm start        # production mode
```

Or run everything in Docker (requires a `.env` file): `docker compose up --build`.

Open **http://localhost:5000/api-docs**, call `POST /auth/login`, click **Authorize** and paste the `accessToken`.

### Useful scripts

| Script | Description |
|---|---|
| `npm run dev` / `npm start` | Start the API (dev with reload / production) |
| `npm test` / `npm run test:coverage` | Integration tests (in-memory MongoDB replica set) |
| `npm run seed` / `npm run seed:fresh` | Seed demo data |
| `npm run lint` / `npm run format` | ESLint / Prettier |
| `npm run docs:postman` | Regenerate the Postman collection from the OpenAPI spec |

## Environment variables

All variables are validated at startup with Zod; the process exits with a clear message if any is missing or invalid. See [`.env.example`](.env.example).

| Variable | Default | Description |
|---|---|---|
| `NODE_ENV` | `development` | `development` \| `production` \| `test` |
| `PORT` | `5000` | HTTP port |
| `API_PREFIX` | `/api/v1` | Base path of all API routes |
| `MONGODB_URI` | — (required) | MongoDB **replica set** connection string |
| `JWT_ACCESS_SECRET` | — (required, ≥ 32 chars) | HMAC secret for access tokens |
| `JWT_ACCESS_EXPIRES_IN` | `15m` | Access-token lifetime |
| `JWT_ISSUER` / `JWT_AUDIENCE` | `crm-sales-api` / `crm-sales-client` | Validated JWT claims |
| `REFRESH_TOKEN_EXPIRES_IN_DAYS` | `7` | Refresh-token lifetime |
| `BCRYPT_SALT_ROUNDS` | `12` | bcrypt cost factor |
| `MAX_LOGIN_ATTEMPTS` / `LOCK_TIME_MINUTES` | `5` / `15` | Account lockout policy |
| `ALLOW_PUBLIC_REGISTRATION` | `true` | `false` = only admins create accounts |
| `COOKIE_SECURE` / `COOKIE_SAME_SITE` | `false` / `strict` | Refresh-cookie flags (`true` / `none` for cross-site HTTPS frontends) |
| `CORS_ORIGINS` | `http://localhost:3000` | Comma-separated allowed origins |
| `TRUST_PROXY` | `0` | Number of proxies in front (set `1` on Render/Heroku) for correct client IPs |
| `RATE_LIMIT_WINDOW_MS` / `RATE_LIMIT_MAX` | 15 min / `300` | Global API rate limit per IP |
| `AUTH_RATE_LIMIT_MAX` | `20` | Failed auth attempts per window per IP |
| `LOG_LEVEL` | `info` | pino log level |

## Authentication

**Access token + rotating refresh token** (hybrid of both mechanisms suggested in the brief):

| Token | Format | Lifetime | Transport | Storage on server |
|---|---|---|---|---|
| Access | JWT (HS256, `sub`, `role`, `tv`, `iss`, `aud`) | 15 min | `Authorization: Bearer …` header | none (stateless) |
| Refresh | 384-bit random opaque string | 7 days | `crm_refresh_token` cookie — `HttpOnly`, `SameSite`, `Secure` (prod), `Path=/api/v1/auth` | SHA-256 hash only |

Flow:

1. `POST /auth/login` → `{ accessToken }` in the body + refresh cookie.
2. Call protected routes with `Authorization: Bearer <accessToken>`.
3. On `401 TOKEN_EXPIRED` → `POST /auth/refresh` → new access token **and a new refresh token** (rotation).
4. `POST /auth/logout` revokes the current refresh token; `POST /auth/logout-all` revokes every session.

Hardening:

- **Refresh-token reuse detection** — every login starts a token *family*; presenting an already-rotated token revokes the whole family (an attacker and the victim are both logged out).
- **Instant revocation** — the access token carries a `tokenVersion`; the auth middleware loads the user on every request, so deactivation, role change, password change or logout-all take effect immediately, not after 15 minutes.
- **Account lockout** after 5 failed logins (HTTP 423) + stricter rate limit on auth routes.
- **No user enumeration** — identical error for unknown email / wrong password, with a dummy bcrypt compare to equalise timing.
- Passwords: bcrypt (cost 12), `select: false`, stripped from every JSON response; strength policy (8+ chars, upper, lower, digit).
- Public registration can only create `sales_executive` accounts; role/manager fields are rejected by the strict schema.

## Roles & permissions

Authorization happens at two levels:

1. **Role gate** (`authorize(...roles)` middleware) — e.g. only admins manage users.
2. **Record-level scope** (`access.service.js`) — every query is combined with an ownership filter, so users can't read or modify records outside their scope even with a valid ID. Out-of-scope records return **404** (not 403) to avoid leaking their existence.

| Scope | admin | sales_manager | sales_executive |
|---|---|---|---|
| Leads / customers / deals visible | all | assigned to self or own team (+ unassigned leads created by the team) | assigned to self |
| Activities visible | all | assigned to / created by self or team | assigned to / created by self |

| Capability | admin | sales_manager | sales_executive |
|---|:-:|:-:|:-:|
| Manage users (create / update / activate / delete) | ✅ | ❌ | ❌ |
| List / view users | all | self + team | ❌ |
| Create & update leads, customers, deals | ✅ | ✅ (team) | ✅ (own) |
| Change lead status, convert qualified leads | ✅ | ✅ (team) | ✅ (own) |
| Assign / reassign leads, customers, deals | ✅ any active exec | ✅ within own team | ❌ |
| Delete leads / customers / deals | ✅ | ✅ (team; won deals: admin only) | ❌ |
| Reopen a closed (won/lost) deal | ✅ | ✅ | ❌ |
| Create activities / notes / follow-ups | ✅ | ✅ (assign to self or team) | ✅ (self only) |
| Delete activities | ✅ | ✅ (team) | ✅ (ones they created) |
| Dashboard summary & pipeline | company | team | self |
| Team performance & revenue trend | ✅ (any team) | ✅ (own team) | ❌ |
| CRM configuration | read + update | read | read |
| Global audit log (`GET /timeline`) | ✅ | ❌ | ❌ |

## API overview

All routes are prefixed with `/api/v1`. Full request/response schemas, parameters and error responses are in Swagger (`/api-docs`).

| Area | Endpoints |
|---|---|
| **Auth** | `POST /auth/register` · `POST /auth/login` · `POST /auth/refresh` · `POST /auth/logout` · `POST /auth/logout-all` · `GET/PATCH /auth/me` · `PATCH /auth/me/password` |
| **Users** | `GET/POST /users` · `GET/PATCH/DELETE /users/:id` · `PATCH /users/:id/status` |
| **Leads** | `GET/POST /leads` · `GET/PATCH/DELETE /leads/:id` · `PATCH /leads/:id/status` · `PATCH /leads/:id/assign` · `POST /leads/:id/convert` · `GET /leads/:id/timeline` |
| **Customers** | `GET/POST /customers` · `GET/PATCH/DELETE /customers/:id` · `PATCH /customers/:id/assign` · `GET /customers/:id/timeline` |
| **Deals** | `GET/POST /deals` · `GET/PATCH/DELETE /deals/:id` · `PATCH /deals/:id/stage` · `PATCH /deals/:id/assign` · `GET /deals/:id/timeline` |
| **Activities** | `GET/POST /activities` · `GET/PATCH/DELETE /activities/:id` · `PATCH /activities/:id/complete` |
| **Dashboard** | `GET /dashboard/summary` · `GET /dashboard/pipeline` · `GET /dashboard/team-performance` · `GET /dashboard/revenue-trend` |
| **Admin** | `GET/PATCH /config` · `GET /timeline` |
| **Health** | `GET /health` (liveness) · `GET /health/ready` (DB readiness) |

### Listing conventions (all list endpoints)

| Parameter | Example | Notes |
|---|---|---|
| `page`, `limit` | `?page=2&limit=50` | `limit` max 100 — large collections are never returned in one response |
| `sort` | `?sort=-value,name` | Comma-separated, `-` = descending, **whitelisted** fields only |
| `search` | `?search=acme` | Case-insensitive, regex-escaped, across name/email/company/phone (per resource) |
| multi-value filters | `?status=new,contacted` or `?status=new&status=contacted` | Combined with `$in` |
| date ranges | `?createdFrom=2026-01-01&createdTo=2026-01-31` | Bare `…To` dates include the whole day |
| amount ranges (deals) | `?minAmount=1000&maxAmount=50000` | Validated `min ≤ max` |

Example — every lead filter at once:

```
GET /api/v1/leads?status=new,contacted&priority=high&source=website,referral&assignedTo=<userId>
    &createdFrom=2026-10-01&createdTo=2026-10-31&search=acme&sort=-createdAt&page=1&limit=20
```

Example — deals:

```
GET /api/v1/deals?stage=proposal,negotiation&status=open&assignedTo=<userId>&minAmount=10000
    &maxAmount=100000&closeDateFrom=2026-11-01&closeDateTo=2026-12-31&sort=-value
```

Pagination metadata returned by every list endpoint:

```json
"meta": { "pagination": { "page": 1, "limit": 20, "totalRecords": 57, "totalPages": 3, "hasNextPage": true, "hasPrevPage": false } }
```

## Business rules

### Leads

- `email` or `phone` is required; emails are lower-cased and unique; phones are normalised (`+91 98765-43210` → `+919876543210`).
- Executives automatically own the leads they create.
- **Status state machine** (`PATCH /leads/:id/status`):

  | From | Allowed to |
  |---|---|
  | `new` | contacted, qualified, unqualified, lost |
  | `contacted` | qualified, unqualified, lost |
  | `qualified` | contacted, unqualified, lost |
  | `unqualified` | contacted, lost |
  | `lost` | contacted (re-engage) |
  | `converted` | — (terminal; read-only) |

  `converted` is never set through this endpoint — only by the conversion workflow. `lost` requires a `reason`.
- **Assignment**: assignee must exist, be **active** and have the `sales_executive` role; managers may only assign within their team. First assignment logs `lead_assigned`, later ones `lead_reassigned` with previous/new owner.
- Converted leads are read-only and cannot be deleted (customers/deals reference them).

### Lead conversion (`POST /leads/:id/convert`)

- Only `qualified` leads that are assigned to an **active** owner can be converted.
- Inside **one MongoDB transaction**:
  1. Conditional update `{ _id, status: 'qualified' } → converted` (concurrent requests: only one can match).
  2. Create the **Customer** (`customer.lead → lead`), defaults copied from the lead, overridable in the body.
  3. Optionally create the **Deal** (`deal.lead → lead`, `deal.customer → customer`).
  4. Back-reference `lead.customer` / `lead.deal`.
  5. Timeline: `lead_status_changed`, `customer_created`, `deal_created`, `lead_converted`.
- Any failure (e.g. duplicate customer email) rolls back **every** write — no orphan customer, no half-converted lead.
- A unique index on `customers.lead` is a final database-level guard: a lead can never have two customers.
- Converting again → `409 Lead has already been converted`. Tested with 4 parallel requests → exactly one succeeds.

### Deals

- `value > 0`; `probability` 0–100 (defaults to the admin-configured probability of the stage); `currency` defaults to config.
- **`expectedRevenue = value × probability / 100` is always computed by the server** — clients cannot send it (strict schemas reject unknown fields).
- `expectedCloseDate` must be today or later and within `maxDealCloseDays` (default 730) — on create and whenever it changes on an open deal.
- New deals start in an open stage; `status` (`open` / `won` / `lost`) is derived from `stage`.
- **Stage state machine** (`PATCH /deals/:id/stage`):
  - open ↔ open: free movement; probability resets to the stage default unless provided.
  - → `won`: value must be > 0, customer must exist, owner must be active; probability = 100, `closedAt`/`closedBy` set; optional `finalValue`; logs `deal_won`.
  - → `lost`: `lostReason` required; probability = 0; logs `deal_lost`.
  - `won` ↔ `lost`: **not allowed** directly.
  - closed → open (**reopen**): only admin/manager, `reopenReason` required, close date must not be in the past; logs `deal_reopened`.
- Closed deals are frozen: only `description` can be edited; they can't be reassigned.
- Won deals are revenue records — only admins can delete them.

### Customers

- Customers created from a lead or with deals **cannot be deleted** (set `status` to `inactive`/`churned` instead).
- No new deals for `churned` customers.
- `GET /customers/:id` returns the original lead and associated deals.

### Activities

- Types: `call`, `email`, `meeting`, `demo`, `follow_up`, `reminder`, `note`. Optionally linked to a lead / customer / deal / user that the caller can access.
- `dueDate` required (and not in the past) for all types except `note`; notes are stored as completed when logged.
- **Overdue is decided by the backend**: only `pending`/`completed` are persisted; an activity is returned as `status: "overdue"` (`isOverdue: true`) when it is pending and its due date has passed. `?status=overdue` translates to `{ status: 'pending', dueDate: { $lt: now } }` — always correct, no cron lag.
- Completed activities can't be edited or completed again. Executives can only assign activities to themselves.
- Querying `?relatedType=lead&relatedId=…` returns the record's full history (including activities logged by previous owners) if the caller can access that record.

### Timeline / audit

Recorded actions: `lead_created`, `lead_updated`, `lead_assigned`, `lead_reassigned`, `lead_status_changed`, `lead_priority_changed`, `lead_converted`, `lead_deleted`, `note_added`, `follow_up_created`, `follow_up_completed`, `activity_created`, `activity_completed`, `activity_deleted`, `customer_created`, `customer_updated`, `customer_assigned`, `customer_deleted`, `deal_created`, `deal_updated`, `deal_stage_changed`, `deal_assigned`, `deal_won`, `deal_lost`, `deal_reopened`, `deal_deleted`, `user_created`, `user_updated`, `user_activated`, `user_deactivated`, `user_deleted`.

Each entry stores `action`, `entityType`, `entityId`, `performedBy`, `previousValue`, `newValue`, `message`, timestamp and **context references** (`lead`, `customer`, `deal`). Because of the context references, a lead's timeline also shows what happened to the customer and deal it became. Events are written **in the same transaction** as the change they describe.

### Analytics

- **Summary**: total/new/qualified/converted leads, conversion rate, customers, total/open/won/lost deals, win rate, total revenue (won value), expected revenue (probability-weighted open pipeline), pipeline value, pending & overdue activities. Scoped by role; filterable by date range and assignee.
- **Pipeline**: count, total value, weighted value and average probability per stage (all six stages always present, in funnel order).
- **Team performance**: per executive — leads, conversions, conversion rate, deals won/lost, win rate, revenue, pipeline, pending/overdue/completed activities; with team totals.
- **Revenue trend**: closed-won revenue per month (zero-filled).

## Database & indexing decisions

Full design with ER diagram: [`docs/DATABASE_DESIGN.md`](docs/DATABASE_DESIGN.md).

- **References** for every relationship between independently-changing entities (User, Lead, Customer, Deal, Activity) — they are queried, filtered, paginated and assigned independently, and some grow without bound.
- **Embedded** only where data has no lifecycle of its own: customer `address`.
- **Polymorphic association** for activities (`relatedType` + `relatedId` with a dynamic `ref`) — one collection serves leads, customers, deals and users.
- **Denormalised context** (`lead`/`customer`/`deal`) on timeline events → a whole-lineage timeline is a single indexed query, no `$lookup`.
- **Derived-but-stored fields** (`deal.status`, `deal.expectedRevenue`) are computed in a `pre('validate')` hook so they can be indexed and aggregated cheaply but never drift.

Key indexes (all compound indexes follow the *equality → sort → range* rule for the dominant query of each collection):

| Collection | Index | Serves |
|---|---|---|
| users | `{ email: 1 }` unique · `{ role: 1, isActive: 1 }` · `{ manager: 1, role: 1 }` | login, filters, team resolution for managers |
| leads | `{ email: 1 }` unique (partial) · `{ assignedTo: 1, status: 1, createdAt: -1 }` · `{ status: 1, createdAt: -1 }` · `{ source: 1, createdAt: -1 }` · `{ priority: 1 }` · `{ createdAt: -1 }` | scoped lists, status/source filters, date ranges |
| customers | `{ email: 1 }` unique (partial) · `{ lead: 1 }` unique (partial) · `{ assignedTo: 1, status: 1, createdAt: -1 }` | duplicate prevention, double-conversion guard, scoped lists |
| deals | `{ assignedTo: 1, stage: 1, createdAt: -1 }` · `{ stage: 1, value: 1 }` · `{ status: 1, expectedCloseDate: 1 }` · `{ status: 1, closedAt: -1 }` · `{ customer: 1, createdAt: -1 }` | scoped lists, pipeline/amount filters, close-date queries, revenue trend |
| activities | `{ assignedTo: 1, status: 1, dueDate: 1 }` · `{ status: 1, dueDate: 1 }` · `{ relatedType: 1, relatedId: 1, createdAt: -1 }` | "my pending/overdue tasks", overdue counts, record history |
| timelineevents | `{ lead/customer/deal: 1, createdAt: -1 }` (partial) · `{ entityType: 1, entityId: 1, createdAt: -1 }` · `{ action: 1, createdAt: -1 }` | per-record timelines, audit filters |
| refreshtokens | `{ tokenHash: 1 }` unique · `{ family: 1 }` · `{ expiresAt: 1 }` **TTL** | rotation, family revocation, automatic cleanup |

Query efficiency:

- List endpoints run `find` + `countDocuments` **in parallel**, use `.lean()` and project populated relations to the few fields needed.
- Dashboards use **aggregation pipelines** (`$group` with conditional sums) and run per-collection aggregations in parallel; team performance uses 3 grouped aggregations merged in memory instead of N per-user queries.
- `autoIndex` is disabled in production; indexes are built explicitly by `npm run seed` (`syncIndexes`).

## Security

| Requirement | Implementation |
|---|---|
| Password hashing | bcrypt (cost 12), never selected or serialised |
| Authentication middleware | `middleware/authenticate.js` — JWT verify (algorithm, issuer, audience pinned) + live user/tokenVersion check |
| Authorization middleware | `authorize(...roles)` + record-level scopes in services |
| Input validation | Zod on params/query/body; **strict** bodies (mass-assignment protection); whitelisted sort fields; ObjectId/email/phone/enum/date/amount checks |
| NoSQL injection | Zod type checks + `sanitize` middleware stripping `$`/`.` keys; search input is regex-escaped |
| Secure auth handling | short-lived JWT, httpOnly/SameSite refresh cookie scoped to `/auth`, rotation + reuse detection, lockout |
| Rate limiting | global per-IP limit + stricter limit on login/register/refresh/password change |
| CORS | explicit origin whitelist, credentials enabled only for those origins |
| Security headers | helmet (CSP, HSTS, nosniff, frameguard, …), `x-powered-by` disabled |
| Payload limits | JSON/urlencoded bodies capped at 100 kB |
| Sensitive data | passwords/tokens/cookies redacted from logs; no stack traces or DB details in production responses; duplicate-key errors name the field but never echo the value |
| Unauthorized resource access | out-of-scope IDs → 404; IDs validated before hitting the DB |

## Error handling & response format

Centralised in `middleware/errorHandler.js`. Operational errors are `AppError`s; Zod, Mongoose (validation/cast), MongoDB duplicate-key (11000), JWT and body-parser errors are normalised; anything else is logged with the request ID and returned as a generic 500.

```json
// success
{ "success": true, "message": "Lead fetched successfully", "data": { … } }

// list
{ "success": true, "message": "Leads fetched successfully", "data": [ … ], "meta": { "pagination": { … } } }

// error
{
  "success": false,
  "message": "Validation failed",
  "code": "VALIDATION_ERROR",
  "errors": [{ "field": "email", "message": "Invalid email format" }],
  "requestId": "2293652f-fd72-4824-a651-f817300c41ae"
}
```

| Status | `code` | When |
|---|---|---|
| 400 | `VALIDATION_ERROR`, `BAD_REQUEST`, `INVALID_ID` | invalid body/query/params, malformed JSON |
| 401 | `UNAUTHORIZED`, `INVALID_TOKEN`, `TOKEN_EXPIRED`, `SESSION_REVOKED`, `INVALID_CREDENTIALS`, `REFRESH_TOKEN_REUSED` … | authentication failures |
| 403 | `FORBIDDEN`, `ACCOUNT_INACTIVE` | role not allowed / action not permitted |
| 404 | `NOT_FOUND`, `ROUTE_NOT_FOUND` | missing or out-of-scope resource |
| 409 | `CONFLICT`, `DUPLICATE_RESOURCE` | duplicates, already converted, concurrent modification |
| 413 | `PAYLOAD_TOO_LARGE` | body over 100 kB |
| 422 | `BUSINESS_RULE_VIOLATION` | invalid status/stage transition, inactive assignee, past close date… |
| 423 | `ACCOUNT_LOCKED` | too many failed logins |
| 429 | `TOO_MANY_REQUESTS` | rate limit |
| 500 | `INTERNAL_ERROR` | unexpected error (details only in server logs) |

Every response carries an `X-Request-Id` header (also in error bodies) to correlate client reports with server logs.

## Testing

```bash
npm test
```

58 integration tests run against a **real MongoDB replica set** (mongodb-memory-server), so transactions, unique indexes and aggregations are exercised for real. Coverage highlights:

- auth: registration hardening, lockout, refresh rotation & **token-reuse detection**, logout, instant revocation on deactivation/password change
- RBAC & record scope: executives vs. teammates, managers vs. other teams, assignment rules
- leads: combined filters + search + date range + pagination, status machine, audit entries
- conversion: lineage, double conversion, **4 concurrent conversions → exactly one customer**, **rollback on mid-transaction failure**
- deals: value/probability validation, computed revenue, lost reason, won↔lost block, reopen rules, frozen closed deals, pipeline
- activities: overdue derivation, follow-up completion audit, scope
- dashboard: KPIs per role, team performance, revenue trend

## Deployment

The app is stateless and container-ready (`Dockerfile`, health checks at `/health` and `/health/ready`).

**Render + MongoDB Atlas** (free tiers):

1. Create an Atlas cluster, a database user, and allow Render's egress IPs (or `0.0.0.0/0` for a demo). Copy the `mongodb+srv://…/crm_sales` URI.
2. On Render: **New → Blueprint**, pick this repository — `render.yaml` configures the service. Set `MONGODB_URI` (and `CORS_ORIGINS` for your frontend).
3. Seed once from your machine: `MONGODB_URI="<atlas-uri>" JWT_ACCESS_SECRET="<any-32+-chars>" npm run seed`.
4. Open `https://<your-service>.onrender.com/api-docs` and add the URL to the table at the top of this README.

## Assumptions

- **Teams**: a sales executive belongs to at most one manager (`users.manager`); a manager's team is the executives that reference them. Managers can also own records themselves.
- **Lead uniqueness**: lead emails are unique across all leads (duplicate inquiries should update the existing lead). Customer emails are unique too.
- **Leads require email or phone**; customers likewise.
- **Lead assignment** targets sales executives only; customers/deals may also be owned by managers (e.g. strategic accounts).
- **Conversion** requires an assigned, active owner; the deal is optional (a customer can be created without an immediate opportunity).
- **Deal value currency** is per deal (default from config); no FX conversion is applied in analytics.
- **"Total revenue"** = sum of won deal values; **"expected revenue"** = probability-weighted value of open deals.
- **Dashboard date filters** apply to record creation dates; pending/overdue activity counts always reflect the current state.
- **Hard deletes** are used where permitted, guarded by integrity rules (converted leads, customers with history and users with records cannot be deleted — deactivate or change status instead). The audit trail is never deleted.
- **Out-of-scope access returns 404** rather than 403 to avoid disclosing other teams' records.
- **Public registration** is enabled for the assignment's "user registration" requirement but can only create `sales_executive` accounts; it can be disabled with `ALLOW_PUBLIC_REGISTRATION=false`.
- MongoDB must run as a replica set (Atlas, docker-compose, or a local replica set) because transactions are a core consistency mechanism.
