# Sample API Requests & Responses

Captured from a running instance seeded with `npm run seed` (IDs and timestamps will differ on your machine).
Base URL: `http://localhost:5000/api/v1`. Full reference: Swagger UI at `/api-docs`.

All protected requests send `Authorization: Bearer <accessToken>`.

---

## 1. Authentication

### Login

```http
POST /api/v1/auth/login
Content-Type: application/json

{ "email": "esha.exec@crm.dev", "password": "Passw0rd!" }
```

`200 OK` + `Set-Cookie: crm_refresh_token=…; Path=/api/v1/auth; HttpOnly; SameSite=Strict`

```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "user": {
      "_id": "6acbd4aa238ff241075f8d51",
      "name": "Esha Executive",
      "email": "esha.exec@crm.dev",
      "role": "sales_executive",
      "manager": "6acbd4a9238ff241075f8d4d",
      "isActive": true,
      "createdAt": "2026-10-11T18:25:46.407Z",
      "updatedAt": "2026-10-11T18:25:46.407Z"
    },
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI2YWNi…",
    "tokenType": "Bearer",
    "expiresIn": "15m"
  }
}
```

Note: no `password`, `tokenVersion` or lockout fields are ever returned.

### Refresh (cookie sent automatically by browsers / Postman)

```http
POST /api/v1/auth/refresh
Cookie: crm_refresh_token=…
```

`200 OK` — same shape as login, with a **new** refresh cookie. Replaying an old refresh token:

```json
{
  "success": false,
  "message": "Refresh token reuse detected. Please log in again.",
  "code": "REFRESH_TOKEN_REUSED",
  "requestId": "…"
}
```

### Wrong password / locked account

```json
{ "success": false, "message": "Invalid email or password", "code": "INVALID_CREDENTIALS", "requestId": "…" }
```

```json
{ "success": false, "message": "Account temporarily locked due to too many failed login attempts. Try again later.", "code": "ACCOUNT_LOCKED", "requestId": "…" }
```

---

## 2. Leads

### Create lead (as a sales executive — auto-assigned to the creator)

```http
POST /api/v1/leads
Content-Type: application/json

{
  "name": "Rohan Gupta",
  "email": "rohan@novatech.io",
  "phone": "+91 98765 43210",
  "company": "NovaTech",
  "source": "referral",
  "priority": "high",
  "description": "Needs CRM for 40 reps"
}
```

`201 Created`

```json
{
  "success": true,
  "message": "Lead created successfully",
  "data": {
    "_id": "6acbd4cfc276245ae6cdcdb6",
    "name": "Rohan Gupta",
    "email": "rohan@novatech.io",
    "phone": "+919876543210",
    "company": "NovaTech",
    "source": "referral",
    "status": "new",
    "priority": "high",
    "description": "Needs CRM for 40 reps",
    "assignedTo": { "_id": "6acbd4aa238ff241075f8d51", "name": "Esha Executive", "email": "esha.exec@crm.dev", "role": "sales_executive" },
    "createdBy": { "_id": "6acbd4aa238ff241075f8d51", "name": "Esha Executive", "email": "esha.exec@crm.dev" },
    "customer": null,
    "deal": null,
    "createdAt": "2026-10-11T18:26:23.812Z",
    "updatedAt": "2026-10-11T18:26:23.812Z"
  }
}
```

### List leads with combined filters

```http
GET /api/v1/leads?status=new,contacted&priority=high&source=website,referral&createdFrom=2026-10-01&createdTo=2026-10-31&search=nova&sort=-createdAt&page=1&limit=2
```

```json
{
  "success": true,
  "message": "Leads fetched successfully",
  "data": [ { "_id": "…", "name": "Rohan Gupta", "status": "new", "priority": "high", "…": "…" } ],
  "meta": {
    "pagination": { "page": 1, "limit": 2, "totalRecords": 1, "totalPages": 1, "hasNextPage": false, "hasPrevPage": false }
  }
}
```

### Update status

```http
PATCH /api/v1/leads/6acbd4cfc276245ae6cdcdb6/status
Content-Type: application/json

{ "status": "qualified" }
```

Invalid transition (`contacted → new`) → `422`:

```json
{
  "success": false,
  "message": "Invalid status transition from \"contacted\" to \"new\"",
  "code": "BUSINESS_RULE_VIOLATION",
  "requestId": "…",
  "errors": { "allowedTransitions": ["qualified", "unqualified", "lost"] }
}
```

### Assign / reassign (admin or manager)

```http
PATCH /api/v1/leads/6acbd4cfc276245ae6cdcdb6/assign
Authorization: Bearer <manager token>
Content-Type: application/json

{ "assignedTo": "6acbd4aa238ff241075f8d52", "note": "Workload balancing" }
```

Assigning to an executive of another team → `403`; to an inactive user → `422 Cannot assign to an inactive user`; by an executive → `403 Your role is not permitted to perform this action`.

---

## 3. Lead conversion (transactional)

```http
POST /api/v1/leads/6acbd4cfc276245ae6cdcdb6/convert
Content-Type: application/json

{
  "customer": { "address": { "city": "Bengaluru", "country": "India" } },
  "deal": { "name": "NovaTech - 40 seat licence", "value": 48000, "expectedCloseDate": "2026-12-15", "stage": "proposal" }
}
```

`201 Created` (abridged)

```json
{
  "success": true,
  "message": "Lead converted successfully",
  "data": {
    "lead": {
      "_id": "6acbd4cfc276245ae6cdcdb6",
      "status": "converted",
      "convertedAt": "2026-10-11T18:26:24.309Z",
      "convertedBy": { "_id": "6acbd4aa238ff241075f8d51", "name": "Esha Executive", "email": "esha.exec@crm.dev" },
      "customer": { "_id": "6acbd4d0c276245ae6cdcdd1", "name": "Rohan Gupta", "email": "rohan@novatech.io", "company": "NovaTech", "status": "active" },
      "deal": { "_id": "6acbd4d0c276245ae6cdcdcf", "name": "NovaTech - 40 seat licence", "value": 48000, "stage": "proposal", "status": "open", "expectedCloseDate": "2026-12-15T00:00:00.000Z" }
    },
    "customer": {
      "_id": "6acbd4d0c276245ae6cdcdd1",
      "name": "Rohan Gupta",
      "email": "rohan@novatech.io",
      "phone": "+919876543210",
      "company": "NovaTech",
      "address": { "city": "Bengaluru", "country": "India" },
      "status": "active",
      "lead": { "_id": "6acbd4cfc276245ae6cdcdb6", "name": "Rohan Gupta", "source": "referral", "status": "converted" },
      "assignedTo": { "_id": "6acbd4aa238ff241075f8d51", "name": "Esha Executive" },
      "deals": [ { "_id": "6acbd4d0c276245ae6cdcdcf", "name": "NovaTech - 40 seat licence", "value": 48000, "probability": 50, "expectedRevenue": 24000, "stage": "proposal", "status": "open" } ]
    },
    "deal": {
      "_id": "6acbd4d0c276245ae6cdcdcf",
      "name": "NovaTech - 40 seat licence",
      "lead": { "_id": "6acbd4cfc276245ae6cdcdb6", "name": "Rohan Gupta", "status": "converted" },
      "customer": { "_id": "6acbd4d0c276245ae6cdcdd1", "name": "Rohan Gupta", "company": "NovaTech" },
      "value": 48000,
      "currency": "USD",
      "probability": 50,
      "expectedRevenue": 24000,
      "expectedCloseDate": "2026-12-15T00:00:00.000Z",
      "stage": "proposal",
      "status": "open"
    }
  }
}
```

Converting again → `409`:

```json
{ "success": false, "message": "Lead has already been converted", "code": "CONFLICT", "requestId": "…" }
```

Converting a non-qualified lead → `422 Only qualified leads can be converted (current status: "contacted")`.

---

## 4. Deals

### Create deal (lead reference is taken from the customer)

```http
POST /api/v1/deals
Content-Type: application/json

{ "name": "NovaTech - Add-on seats", "customer": "6acbd4d0c276245ae6cdcdd1", "value": 12000, "expectedCloseDate": "2026-12-20", "stage": "discovery" }
```

`201 Created` → `probability: 25` (configured default for discovery), `expectedRevenue: 3000`.

Sending `"expectedRevenue": 99999` → `400 VALIDATION_ERROR` (`Unrecognized key(s) in object: 'expectedRevenue'`) — it is always computed by the server.

### Close as won

```http
PATCH /api/v1/deals/6acbd4d0c276245ae6cdcdcf/stage
Content-Type: application/json

{ "stage": "won", "finalValue": 46500 }
```

```json
{
  "success": true,
  "message": "Deal moved to won",
  "data": {
    "_id": "6acbd4d0c276245ae6cdcdcf",
    "name": "NovaTech - 40 seat licence",
    "value": 46500,
    "currency": "USD",
    "probability": 100,
    "expectedRevenue": 46500,
    "stage": "won",
    "status": "won",
    "closedAt": "2026-10-11T18:26:24.900Z",
    "closedBy": { "_id": "6acbd4aa238ff241075f8d51", "name": "Esha Executive", "email": "esha.exec@crm.dev" },
    "…": "…"
  }
}
```

### Rule violations

| Request | Response |
|---|---|
| `{ "stage": "lost" }` (no reason) | `400` — `lostReason: A lost reason is required when closing a deal as lost` |
| won → `{ "stage": "lost", "lostReason": "…" }` | `422` — `A won deal cannot be moved directly to lost. Reopen it first.` |
| executive: won → `{ "stage": "negotiation", "reopenReason": "…" }` | `403` — `Only managers or admins can reopen a closed deal` |
| manager: won → `{ "stage": "negotiation" }` | `422` — `A reopenReason is required to move a closed deal back to an active stage` |
| `PATCH /deals/:id { "value": 1 }` on a won deal | `422` — `Deal is closed (won); only the description can be changed. Reopen the deal first.` |
| create with `"expectedCloseDate": "2020-01-01"` | `422` — `Expected closing date cannot be in the past` |
| create with `"value": 0` | `400` — `Deal value must be greater than zero` |

### Filter deals

```http
GET /api/v1/deals?stage=proposal,negotiation&status=open&minAmount=10000&maxAmount=100000&closeDateFrom=2026-11-01&closeDateTo=2026-12-31&sort=-value
```

---

## 5. Timeline

```http
GET /api/v1/leads/6acbd4cfc276245ae6cdcdb6/timeline?limit=10
```

```json
{
  "success": true,
  "message": "Lead timeline fetched successfully",
  "data": [
    {
      "action": "deal_won",
      "entityType": "deal",
      "entityId": "6acbd4d0c276245ae6cdcdcf",
      "performedBy": { "_id": "6acbd4aa238ff241075f8d51", "name": "Esha Executive", "role": "sales_executive" },
      "newValue": { "value": 46500, "currency": "USD" },
      "lead": "6acbd4cfc276245ae6cdcdb6", "customer": "6acbd4d0c276245ae6cdcdd1", "deal": "6acbd4d0c276245ae6cdcdcf",
      "createdAt": "2026-10-11T18:26:24.904Z"
    },
    {
      "action": "deal_stage_changed",
      "entityType": "deal",
      "previousValue": { "stage": "proposal", "probability": 50 },
      "newValue": { "stage": "won", "probability": 100 },
      "…": "…"
    },
    { "action": "lead_converted", "entityType": "lead", "newValue": { "customer": "6acbd4d0c276245ae6cdcdd1", "deal": "6acbd4d0c276245ae6cdcdcf" }, "…": "…" },
    { "action": "deal_created", "…": "…" },
    { "action": "customer_created", "message": "Created from lead conversion", "…": "…" },
    { "action": "lead_status_changed", "previousValue": "qualified", "newValue": "converted", "…": "…" },
    { "action": "lead_status_changed", "previousValue": "contacted", "newValue": "qualified", "…": "…" },
    { "action": "lead_status_changed", "previousValue": "new", "newValue": "contacted", "…": "…" },
    { "action": "lead_assigned", "previousValue": null, "newValue": { "_id": "6acbd4aa238ff241075f8d51", "name": "Esha Executive" }, "…": "…" },
    { "action": "lead_created", "newValue": { "name": "Rohan Gupta", "status": "new", "source": "referral", "priority": "high" }, "…": "…" }
  ],
  "meta": { "pagination": { "page": 1, "limit": 10, "totalRecords": 10, "totalPages": 1, "hasNextPage": false, "hasPrevPage": false } }
}
```

---

## 6. Activities

### Create a follow-up on a deal

```http
POST /api/v1/activities
Content-Type: application/json

{ "type": "follow_up", "title": "Send revised proposal", "dueDate": "2026-10-20T10:00:00.000Z", "relatedType": "deal", "relatedId": "6acbd4d0c276245ae6cdcdcf" }
```

### Overdue activities (manager view of the team)

```http
GET /api/v1/activities?status=overdue
```

```json
{
  "success": true,
  "message": "Activities fetched successfully",
  "data": [
    {
      "_id": "6acbd4ad238ff241075f8fc2",
      "type": "call",
      "title": "Call back about pricing (overdue)",
      "status": "overdue",
      "isOverdue": true,
      "dueDate": "2026-10-09T18:25:49.175Z",
      "assignedTo": { "_id": "6acbd4aa238ff241075f8d51", "name": "Esha Executive", "email": "esha.exec@crm.dev", "role": "sales_executive" },
      "createdBy": { "_id": "6acbd4a9238ff241075f8d4b", "name": "Ada Admin", "email": "admin@crm.dev" },
      "createdAt": "2026-10-11T18:25:49.176Z",
      "updatedAt": "2026-10-11T18:25:49.176Z"
    }
  ],
  "meta": { "pagination": { "page": 1, "limit": 20, "totalRecords": 1, "totalPages": 1, "hasNextPage": false, "hasPrevPage": false } }
}
```

### Complete

```http
PATCH /api/v1/activities/6acbd4ad238ff241075f8fc2/complete
Content-Type: application/json

{ "outcome": "Customer confirmed budget approval" }
```

---

## 7. Dashboard

### Summary (executive — own records only)

```http
GET /api/v1/dashboard/summary
```

```json
{
  "success": true,
  "message": "Dashboard summary fetched successfully",
  "data": {
    "leads": { "total": 3, "new": 0, "contacted": 0, "qualified": 0, "unqualified": 1, "converted": 2, "lost": 0, "conversionRate": 66.67 },
    "customers": { "total": 2 },
    "deals": { "total": 2, "open": 0, "won": 2, "lost": 0, "winRate": 100 },
    "revenue": { "totalRevenue": 109000, "expectedRevenue": 0, "pipelineValue": 0 },
    "activities": { "pending": 5, "overdue": 1 }
  }
}
```

### Pipeline (admin — whole company)

```http
GET /api/v1/dashboard/pipeline
```

```json
{
  "success": true,
  "message": "Sales pipeline fetched successfully",
  "data": {
    "stages": [
      { "stage": "qualification", "count": 1, "totalValue": 27000, "weightedValue": 2700, "averageProbability": 10 },
      { "stage": "discovery", "count": 0, "totalValue": 0, "weightedValue": 0, "averageProbability": 0 },
      { "stage": "proposal", "count": 1, "totalValue": 32000, "weightedValue": 16000, "averageProbability": 50 },
      { "stage": "negotiation", "count": 0, "totalValue": 0, "weightedValue": 0, "averageProbability": 0 },
      { "stage": "won", "count": 3, "totalValue": 155500, "weightedValue": 155500, "averageProbability": 100 },
      { "stage": "lost", "count": 1, "totalValue": 15000, "weightedValue": 0, "averageProbability": 0 }
    ],
    "totals": { "count": 6, "totalValue": 229500, "weightedValue": 174200 }
  }
}
```

### Team performance (manager)

```http
GET /api/v1/dashboard/team-performance
```

```json
{
  "success": true,
  "message": "Team performance fetched successfully",
  "data": {
    "teamSize": 2,
    "totals": {
      "leads": 7, "convertedLeads": 4, "conversionRate": 57.14, "dealsWon": 3, "dealsLost": 0,
      "totalRevenue": 155500, "expectedRevenue": 16000, "pendingActivities": 9, "overdueActivities": 1
    },
    "members": [
      {
        "user": { "_id": "6acbd4aa238ff241075f8d51", "name": "Esha Executive", "email": "esha.exec@crm.dev", "isActive": true },
        "leads": { "total": 4, "qualified": 0, "converted": 3, "lost": 0, "conversionRate": 75 },
        "deals": { "total": 3, "open": 0, "won": 3, "lost": 0, "winRate": 100 },
        "revenue": { "totalRevenue": 155500, "pipelineValue": 0, "expectedRevenue": 0 },
        "activities": { "pending": 5, "overdue": 1, "completed": 3 }
      },
      {
        "user": { "_id": "6acbd4aa238ff241075f8d52", "name": "Arjun Executive", "email": "arjun.exec@crm.dev", "isActive": true },
        "leads": { "total": 3, "qualified": 1, "converted": 1, "lost": 1, "conversionRate": 33.33 },
        "deals": { "total": 1, "open": 1, "won": 0, "lost": 0, "winRate": 0 },
        "revenue": { "totalRevenue": 0, "pipelineValue": 32000, "expectedRevenue": 16000 },
        "activities": { "pending": 4, "overdue": 0, "completed": 3 }
      }
    ]
  }
}
```

Executive calling this endpoint → `403 Your role is not permitted to perform this action`.

---

## 8. Generic errors

| Case | Response |
|---|---|
| Unknown route | `404 { "success": false, "message": "Route GET /api/v1/nope not found", "code": "ROUTE_NOT_FOUND" }` |
| Validation | `400 { "message": "Validation failed", "code": "VALIDATION_ERROR", "errors": [{ "field": "email", "message": "Invalid email format" }] }` |
| Malformed JSON | `400 { "message": "Malformed JSON in request body", "code": "BAD_REQUEST" }` |
| NoSQL injection attempt `{ "email": { "$gt": "" } }` | `400 { "code": "VALIDATION_ERROR", "errors": [{ "field": "email", "message": "Expected string, received object" }] }` |
| Invalid ObjectId | `400 { "errors": [{ "field": "id", "message": "Invalid ID format" }] }` |
| Missing token | `401 { "message": "Authentication required. Provide a Bearer access token.", "code": "UNAUTHORIZED" }` |
| Expired token | `401 { "message": "Access token has expired", "code": "TOKEN_EXPIRED" }` |
| Another team's record | `404 { "message": "Lead not found", "code": "NOT_FOUND" }` |
| Duplicate email | `409 { "message": "A record with this email already exists", "code": "DUPLICATE_RESOURCE" }` |
| Rate limit | `429 { "message": "Too many requests, please try again later.", "code": "TOO_MANY_REQUESTS" }` |
