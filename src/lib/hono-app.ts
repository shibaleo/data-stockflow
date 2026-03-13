import { OpenAPIHono } from "@hono/zod-openapi";
import { logger } from "hono/logger";
import { apiReference } from "@scalar/hono-api-reference";
import { contextMiddleware } from "@/middleware/context";
import { requireWritable } from "@/middleware/guards";
import { errorHandler } from "@/middleware/error-handler";
import health from "@/routes/health";
import auth from "@/routes/auth";
import accounts from "@/routes/accounts";
import tags from "@/routes/tags";
import departments from "@/routes/departments";
import fiscalPeriods from "@/routes/fiscal-periods";
import counterparties from "@/routes/counterparties";
import taxClasses from "@/routes/tax-classes";
import tenantSettings from "@/routes/tenant-settings";
import accountMappings from "@/routes/account-mappings";
import paymentMappings from "@/routes/payment-mappings";
import journals from "@/routes/journals";

// ────────────────────────────────────────────
// Atomic API v1 — /api/atom/v1
// Minimal-unit CRUD operations
// ────────────────────────────────────────────

const atomApp = new OpenAPIHono().basePath("/api/atom/v1");

atomApp.use("*", logger());
atomApp.onError(errorHandler);

// Public routes (no auth)
atomApp.route("/health", health);
atomApp.route("/auth", auth);

// Context middleware for all subsequent routes
atomApp.use("*", contextMiddleware);

// Audit role enforcement: read-only for audit users
atomApp.use("*", requireWritable());

// Master routes
atomApp.route("/accounts", accounts);
atomApp.route("/tags", tags);
atomApp.route("/departments", departments);
atomApp.route("/fiscal-periods", fiscalPeriods);
atomApp.route("/counterparties", counterparties);
atomApp.route("/tax-classes", taxClasses);
atomApp.route("/tenant-settings", tenantSettings);
atomApp.route("/account-mappings", accountMappings);
atomApp.route("/payment-mappings", paymentMappings);

// Transaction routes
atomApp.route("/journals", journals);

// OpenAPI spec
atomApp.doc("/doc", {
  openapi: "3.1.0",
  info: {
    title: "data-stockflow Atomic API",
    version: "1.0.0",
    description: `Minimal-unit CRUD API for the append-only double-entry bookkeeping system.

## Double-Entry Convention

Journal lines use standard double-entry bookkeeping format:
- **amount**: Always a positive number representing the monetary value.
- **side**: Either "debit" or "credit", indicating the accounting direction.

Example — record "Expense 1000 / Cash 1000":
\`\`\`json
{
  "lines": [
    { "side": "debit",  "account_code": "expense", "amount": 1000, "line_group": 1 },
    { "side": "credit", "account_code": "cash",    "amount": 1000, "line_group": 1 }
  ]
}
\`\`\`
The sum of all debit amounts must equal the sum of all credit amounts.

## Append-Only Model

All write operations (create, update, delete, restore) are INSERT-only with incrementing revision numbers. No rows are ever updated or deleted. The latest active revision represents the current state.

## Roles

| Role | Access |
|------|--------|
| platform | tax_class CRUD |
| audit | Read-only (all GET endpoints) |
| tenant | tenant_settings management |
| admin | All master CRUD, all journal types |
| user | Normal journals, tags, counterparties |`,
  },
});

// Scalar API Reference UI
atomApp.get(
  "/reference",
  apiReference({
    url: "/api/atom/v1/doc",
    theme: "kepler",
  })
);

export default atomApp;
