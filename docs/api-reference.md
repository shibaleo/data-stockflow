# data-stockflow API Reference

## Authentication

Two methods are supported. Both resolve to the same internal context (`tenantKey`, `userKey`, `userRole`).

| Method | Header | Use case |
|---|---|---|
| API Key | `Authorization: Bearer sf_...` | Scripts, CI, external integrations |
| Clerk Session | Automatic (cookie-based JWT) | Browser UI |

API keys are created during bootstrap (`scripts/bootstrap.ts`) or via the Users API.

```bash
curl -H "Authorization: Bearer $API_KEY" https://HOST/api/v1/books
```

---

## Base URL & Common Conventions

**Base path:** `/api/v1`

### Response Envelope

Single resource:
```json
{ "data": { "id": 1, "name": "..." } }
```

Paginated list:
```json
{ "data": [ ... ], "next_cursor": "abc123" }
```

Error:
```json
{ "error": "description" }
```

Message (deactivate / restore / purge):
```json
{ "message": "Deactivated" }
```

### Pagination

| Param | Type | Default | Description |
|---|---|---|---|
| `limit` | string (number) | `"100"` | Max items per page (max 200) |
| `cursor` | string | — | Opaque cursor from `next_cursor` of previous response |
| `include_inactive` | string | `"false"` | `"true"` to include deactivated items |

### Field Naming

- DB internal `key` is exposed as `id` in the API.
- Foreign keys follow the pattern `{entity}_id` (e.g. `book_id`, `tenant_id`).
- Dates are ISO 8601 strings.

---

## Roles & Access Control

| Role | Read | Master Write | Journal Write | Tenant Manage |
|---|:---:|:---:|:---:|:---:|
| **platform** | All tenants | Yes | Yes | Yes |
| **admin** | Own tenant | Yes | Yes | No |
| **user** | Own tenant | No | Yes | No |
| **audit** | Own tenant | No (403) | No (403) | No |

---

## Master CRUD (Common Pattern)

The following entities share an identical set of endpoints:

- **Tenant** — `/tenants`
- **Role** — `/roles`
- **User** — `/users`
- **Book** — `/books`
- **Category** — `/categories`
- **Department** — `/departments`
- **Counterparty** — `/counterparties`
- **Project** — `/projects`

Book-scoped entities (the path is prefixed with `/books/{bookId}`):

- **Account** — `/books/{bookId}/accounts`
- **Display Account** — `/books/{bookId}/display-accounts`

### Endpoints

| Method | Path | Description | Status |
|---|---|---|---|
| GET | `/{entity}` | List (paginated, cursor-based) | 200 |
| GET | `/{entity}/{id}` | Get single | 200 / 404 |
| POST | `/{entity}` | Create (new key, revision 1) | 201 |
| PUT | `/{entity}/{id}` | Update (same key, revision + 1) | 200 / 404 |
| DELETE | `/{entity}/{id}` | Deactivate (is_active → false) | 200 / 422 |
| POST | `/{entity}/{id}/restore` | Restore (is_active → true) | 200 / 422 |
| POST | `/{entity}/{id}/purge` | Purge (sets valid_to, irreversible) | 200 / 422 |
| GET | `/{entity}/{id}/history` | All revisions | 200 |

422 is returned when referential integrity prevents the operation.

---

## Entity Schemas

### Tenant

**Scope:** Platform

**Response:**
```json
{ "id": 1, "name": "Acme Corp", "locked_until": null, "revision": 1, "created_at": "2025-01-01T00:00:00Z" }
```

**Create** `POST /tenants`:
```json
{ "name": "Acme Corp" }
```

**Update** `PUT /tenants/{id}`:
```json
{ "name": "New Name", "locked_until": "2025-12-31T00:00:00Z" }
```
All fields optional.

---

### Role

**Scope:** Platform (seed data — normally read-only)

**Response:**
```json
{ "id": 100000000002, "code": "admin", "name": "Tenant Admin", "is_active": true, "revision": 1, "created_at": "..." }
```

**Create** `POST /roles`:
```json
{ "code": "custom", "name": "Custom Role" }
```

---

### User

**Scope:** Tenant

**Response:**
```json
{
  "id": 1, "email": "user@example.com", "external_id": "clerk_xxx",
  "code": "U001", "name": "Taro", "tenant_id": 1, "role_id": 100000000002,
  "is_active": true, "revision": 1, "created_at": "..."
}
```

**Create** `POST /users`:
```json
{ "email": "user@example.com", "code": "U001", "name": "Taro", "role_id": 100000000002 }
```

**Update** `PUT /users/{id}`:
```json
{ "name": "New Name", "role_id": 100000000003 }
```

**Special:** `GET /users/me` returns the current authenticated user.

---

### Book

**Scope:** Tenant

**Response:**
```json
{
  "id": 1, "code": "MAIN", "name": "Main Ledger",
  "unit": "JPY", "unit_symbol": "円", "unit_position": "right",
  "type_labels": { "asset": "資産", "liability": "負債", "equity": "純資産", "revenue": "収益", "expense": "費用" },
  "is_active": true, "revision": 1, "created_at": "..."
}
```

**Create** `POST /books`:
```json
{
  "code": "MAIN", "name": "Main Ledger", "unit": "JPY",
  "unit_symbol": "円", "unit_position": "right",
  "type_labels": { "asset": "資産", "revenue": "収益" }
}
```
`unit_symbol`, `unit_position`, `type_labels` are optional.

---

### Account

**Scope:** Book (`/books/{bookId}/accounts`)

**Response:**
```json
{
  "id": 1, "book_id": 1, "code": "1000", "name": "Cash",
  "account_type": "asset", "is_active": true,
  "parent_account_id": null, "display_account_id": null,
  "sign": -1, "revision": 1, "created_at": "..."
}
```

`account_type`: `"asset"` | `"liability"` | `"equity"` | `"revenue"` | `"expense"`

`sign`: `-1` for asset/expense (debit-normal), `+1` for liability/equity/revenue (credit-normal). Auto-computed.

**Create** `POST /books/{bookId}/accounts`:
```json
{ "code": "1000", "name": "Cash", "account_type": "asset" }
```
Optional: `parent_account_id`, `display_account_id`.

---

### Display Account

**Scope:** Book (`/books/{bookId}/display-accounts`)

A separate reporting hierarchy. Accounts map to display accounts via `display_account_id`.

**Response:**
```json
{
  "id": 1, "book_id": 1, "code": "BS-100", "name": "Current Assets",
  "account_type": "asset", "parent_id": null, "sort_order": 100,
  "authority_level": "tenant", "is_active": true, "revision": 1, "created_at": "..."
}
```

`authority_level`: `"tenant"` | `"admin"` | `"user"`

**Create** `POST /books/{bookId}/display-accounts`:
```json
{ "code": "BS-100", "name": "Current Assets", "account_type": "asset" }
```
Optional: `parent_id`, `sort_order`.

---

### Category

**Scope:** Tenant

Unified classification system replacing the former tag, voucher_type, and journal_type tables.

**Response:**
```json
{
  "id": 1, "category_type_code": "journal_type", "code": "SALE",
  "name": "Sales", "is_active": true, "parent_category_id": null,
  "revision": 1, "created_at": "..."
}
```

**Create** `POST /categories`:
```json
{ "category_type_code": "journal_type", "code": "SALE", "name": "Sales" }
```
Optional: `parent_category_id`.

**Category Types** (read-only, seed data):

| code | allow_multiple | Description |
|---|---|---|
| `journal_type` | false | Journal classification (one per journal) |
| `journal_tag` | true | Free-form journal tags (many per journal) |

List category types: `GET /category-types`

---

### Department

**Scope:** Tenant

**Response:**
```json
{
  "id": 1, "code": "SALES", "name": "Sales Dept",
  "department_type": "division", "is_active": true,
  "parent_department_id": null, "revision": 1, "created_at": "..."
}
```

**Create** `POST /departments`:
```json
{ "code": "SALES", "name": "Sales Dept" }
```
Optional: `parent_department_id`, `department_type`.

---

### Counterparty

**Scope:** Tenant

**Response:**
```json
{
  "id": 1, "code": "VENDOR01", "name": "Vendor Inc",
  "is_active": true, "parent_counterparty_id": null,
  "revision": 1, "created_at": "..."
}
```

**Create** `POST /counterparties`:
```json
{ "code": "VENDOR01", "name": "Vendor Inc" }
```
Optional: `parent_counterparty_id`.

---

### Project

**Scope:** Tenant

**Response:**
```json
{
  "id": 1, "code": "PROJ-A", "name": "Project Alpha",
  "department_id": null, "start_date": "2025-01-01T00:00:00Z",
  "end_date": null, "is_active": true,
  "parent_project_id": null, "revision": 1, "created_at": "..."
}
```

**Create** `POST /projects`:
```json
{ "code": "PROJ-A", "name": "Project Alpha" }
```
Optional: `department_id`, `start_date`, `end_date`, `parent_project_id`.

---

## Transactions

### Create Voucher (with Journals)

`POST /vouchers`

A voucher groups one or more journals. Each journal belongs to a specific book and contains balanced debit/credit lines.

**Request:**
```json
{
  "idempotency_key": "import-batch-001",
  "voucher_code": "V-2025-001",
  "description": "Office supplies",
  "source_system": "manual",
  "journals": [
    {
      "book_id": 1,
      "posted_at": "2025-03-15T00:00:00Z",
      "journal_type_id": 5,
      "project_id": 1,
      "adjustment_flag": "none",
      "description": "Stationery purchase",
      "metadata": {},
      "lines": [
        { "sort_order": 1, "side": "debit",  "account_id": 10, "amount": 1000, "department_id": 1 },
        { "sort_order": 1, "side": "credit", "account_id": 20, "amount": 1000 }
      ],
      "tags": [10, 11]
    }
  ]
}
```

**Key fields:**
- `idempotency_key` (required): Prevents duplicate vouchers.
- `journals[].book_id`, `posted_at`, `journal_type_id`, `project_id` (required).
- `journals[].adjustment_flag`: `"none"` (default) | `"monthly_adj"` | `"year_end_adj"`.
- `journals[].lines[].side`: `"debit"` | `"credit"`.
- `journals[].lines[].amount`: Always positive. Internally stored as signed (credit = +, debit = -).
- `journals[].tags`: Array of category IDs (category_type_code = `journal_tag`).
- `department_id`, `counterparty_id`, `description` on lines are optional.

**Balance rule:** Sum of debit amounts must equal sum of credit amounts within each journal.

**Response** `201`:
```json
{
  "data": {
    "id": 1, "revision": 1, "idempotency_key": "import-batch-001",
    "voucher_code": "V-2025-001", "description": "Office supplies",
    "source_system": "manual", "created_at": "...",
    "journals": [
      {
        "id": 1, "voucher_id": 1, "book_id": 1,
        "posted_at": "2025-03-15T00:00:00Z",
        "revision": 1, "is_active": true, "project_id": 1,
        "adjustment_flag": "none", "description": "Stationery purchase",
        "metadata": {}, "created_at": "...",
        "lines": [
          { "uuid": "...", "sort_order": 1, "side": "debit", "account_id": 10, "department_id": 1, "counterparty_id": null, "amount": "1000", "description": null },
          { "uuid": "...", "sort_order": 1, "side": "credit", "account_id": 20, "department_id": null, "counterparty_id": null, "amount": "1000", "description": null }
        ],
        "categories": [
          { "uuid": "...", "category_type_code": "journal_type", "category_key": 5, "created_at": "..." },
          { "uuid": "...", "category_type_code": "journal_tag", "category_key": 10, "created_at": "..." }
        ]
      }
    ]
  }
}
```

### List Vouchers

`GET /vouchers`

Standard paginated list. Each voucher includes summary fields only (no nested journals).

### Get Voucher Detail

`GET /vouchers/{id}`

Returns voucher with nested journals, lines, and categories.

### Update Voucher

`PUT /vouchers/{id}`

```json
{ "voucher_code": "V-2025-001-R", "description": "Updated description" }
```
All fields optional.

---

### List Journals for Voucher

`GET /vouchers/{voucherId}/journals`

### Get Journal Detail

`GET /vouchers/{voucherId}/journals/{id}`

Returns journal with `lines` and `categories` arrays.

### Update Journal

`PUT /vouchers/{voucherId}/journals/{id}`

Creates a new revision. Lines and categories are re-created.

```json
{
  "posted_at": "2025-03-16T00:00:00Z",
  "journal_type_id": 5,
  "project_id": 1,
  "lines": [
    { "sort_order": 1, "side": "debit",  "account_id": 10, "amount": 1500 },
    { "sort_order": 1, "side": "credit", "account_id": 20, "amount": 1500 }
  ],
  "tags": [10]
}
```
`lines` is required (full replacement). Other fields are optional.

### Deactivate Journal

`DELETE /vouchers/{voucherId}/journals/{id}`

Sets `is_active = false` via a new revision.

### Journal History

`GET /vouchers/{voucherId}/journals/{id}/history`

---

## Operations

### Reverse Journal

`POST /journals/{id}/reverse`

Creates a counter-entry that flips all debit/credit sides with the same amounts. The original journal remains unchanged.

---

## Reports

`GET /books/{bookId}/reports`

Returns aggregated balances for the specified book.

---

## Entity Colors

`POST /entity-colors`

Sets a display color for any entity.
```json
{ "entity_type": "account", "entity_key": 1, "color": "#FF5733" }
```

`GET /entity-colors/{entity_type}/{id}`

Returns the color for a specific entity. Colors are attached to list/detail responses as `color_hex`.

---

## Audit & Integrity

### System Logs

`GET /audit-logs`

Technical audit trail. Query params: `entity_type`, `entity_id`, `action`, `limit`, `cursor`.

**Response item:**
```json
{
  "uuid": "...", "tenant_id": 1, "user_id": 1, "user_role": "admin",
  "action": "create", "entity_type": "account", "entity_id": 10,
  "revision": 1, "detail": null, "source_ip": "127.0.0.1", "created_at": "..."
}
```

### Event Logs

`GET /event-logs`

Business-level activity log. Query params: `entity_type`, `action`, `limit`, `cursor`.

**Response item:**
```json
{
  "uuid": "...", "tenant_id": 1, "user_name": "Taro", "user_role": "admin",
  "action": "create", "entity_type": "account", "entity_name": "Cash",
  "summary": "Created account 'Cash'",
  "changes": [{ "field": "name", "from": null, "to": "Cash" }],
  "source_ip": "127.0.0.1", "created_at": "..."
}
```

### Integrity Verification

`GET /integrity/verify`

Validates hash chains across all entities and vouchers.

---

## API Documentation (Interactive)

| Path | Description |
|---|---|
| `GET /api/v1/doc` | OpenAPI 3.1 spec (JSON) |
| `GET /api/v1/reference` | Scalar interactive API explorer |

---

## Health Check

`GET /api/v1/health`

Returns `200` when the server is running.
