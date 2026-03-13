# 008: API v1 Design — Atomic API + Operations API

## Overview

API を2つのサービスに分離し、ロール体系を5ロールに拡張する。

- **Atomic API** (`/api/atom/v1`) — 最小単位の CRUD 操作
- **Operations API** (`/api/ops/v1`) — 業務操作 + レポート

## URL Structure

```
/api/atom/v1/                    Atomic API
  health                         GET     public
  auth/token                     POST    public
  accounts                       CRUD    admin
  tags                           CRUD    admin, user
  departments                    CRUD    admin
  fiscal-periods                 CRUD    admin
  counterparties                 CRUD    admin, user
  tax-classes                    CRUD    platform
  tenant-settings                CR(U)   tenant
  account-mappings               CRUD    admin
  payment-mappings               CRUD    admin
  journals                       CRUD    admin, user

/api/ops/v1/                     Operations API
  journals/{code}/reverse        POST    admin, user
  periods/{code}/close           POST    tenant, admin
  periods/{code}/reopen          POST    tenant, admin
  reports/balances               GET     all authenticated
```

## Roles (5 roles)

| Role | Read | Write | Use Case |
|------|------|-------|----------|
| `platform` | All | tax_class CRUD | System administration |
| `audit` | **All** | **None** | Tax advisor, auditor (read-only) |
| `tenant` | All | tenant_settings, period close/reopen | Business owner |
| `admin` | All | All master CRUD, all journal types, all ops | Accountant |
| `user` | All | Normal journals, tags, counterparties | General user |

### audit Role

The `audit` role has full read access to all endpoints in both Atomic and Operations APIs.
Any write operation (POST/PUT/DELETE/PATCH) returns `403 Audit role is read-only`.

Implemented via `requireWritable()` middleware applied globally to both API routers.

## Operations

### Journal Reversal

```
POST /api/ops/v1/journals/{code}/reverse
```

Creates a full-amount counter-entry for the specified journal:
- All debit lines become credit, all credit lines become debit
- Amounts are negated (preserving SUM=0 invariant)
- `idempotency_code`: `reverse:{original_code}` (prevents duplicate reversals)
- `posted_date`: Specified in body, or defaults to now
- Tags are copied from the original journal

### Period Close

```
POST /api/ops/v1/periods/{code}/close
```

Transitions fiscal period status: `open` → `closed`.
Journals API rejects entries for closed periods.

### Period Reopen

```
POST /api/ops/v1/periods/{code}/reopen
```

Transitions fiscal period status: `closed` → `open`.

## OpenAPI Documentation

| API | Spec | Scalar UI |
|-----|------|-----------|
| Atomic | `/api/atom/v1/doc` | `/api/atom/v1/reference` |
| Operations | `/api/ops/v1/doc` | `/api/ops/v1/reference` |

## Client Library

```typescript
import { api, opsApi } from "@/lib/api-client";

// Atomic API
await api.get("/accounts?limit=200");
await api.post("/journals", { ... });

// Operations API
await opsApi.post("/journals/zaim:12345/reverse", { posted_date: "2025-04-01T00:00:00Z" });
await opsApi.post("/periods/FP001/close", {});
await opsApi.get("/reports/balances?period_from=2025-03");
```

## Future Endpoints (planned)

```
/api/ops/v1/
  journals/batch               POST    一括仕訳登録
  imports/journals             POST    CSV/JSONインポート
  exports/journals             GET     エクスポート
  reports/trial-balance        GET     試算表
  reports/general-ledger       GET     総勘定元帳
  reports/financial-statements GET     BS/PL
  maintenance/verify           POST    整合性チェック
  maintenance/rebuild-ledger   POST    再集計
```
