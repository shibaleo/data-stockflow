import { OpenAPIHono } from "@hono/zod-openapi";
import { logger } from "hono/logger";
import { apiReference } from "@scalar/hono-api-reference";
import { contextMiddleware } from "@/middleware/context";
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

const app = new OpenAPIHono().basePath("/api");

app.use("*", logger());
app.onError(errorHandler);

// Public routes (no auth)
app.route("/health", health);
app.route("/auth", auth);

// Context middleware for all subsequent routes
app.use("*", contextMiddleware);

// Master routes
app.route("/accounts", accounts);
app.route("/tags", tags);
app.route("/departments", departments);
app.route("/fiscal-periods", fiscalPeriods);
app.route("/counterparties", counterparties);
app.route("/tax-classes", taxClasses);
app.route("/tenant-settings", tenantSettings);
app.route("/account-mappings", accountMappings);
app.route("/payment-mappings", paymentMappings);

// Transaction routes
app.route("/journals", journals);

// OpenAPI spec endpoint
app.doc("/doc", {
  openapi: "3.1.0",
  info: {
    title: "data-stockflow API",
    version: "1.0.0",
    description: `Append-only double-entry bookkeeping API with bi-temporal versioning.

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

Internally, amounts are stored as signed values (debit=negative, credit=positive) with a SUM=0 balance invariant, but the API abstracts this away.

## Append-Only Model

All write operations (create, update, delete, restore) are INSERT-only with incrementing revision numbers. No rows are ever updated or deleted. The latest active revision represents the current state.`,
  },
});

// Scalar API Reference UI
app.get(
  "/reference",
  apiReference({
    url: "/api/doc",
    theme: "kepler",
  })
);

export default app;
