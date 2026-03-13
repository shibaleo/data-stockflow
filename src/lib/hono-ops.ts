import { OpenAPIHono } from "@hono/zod-openapi";
import { logger } from "hono/logger";
import { apiReference } from "@scalar/hono-api-reference";
import { contextMiddleware } from "@/middleware/context";
import { requireWritable } from "@/middleware/guards";
import { errorHandler } from "@/middleware/error-handler";
import journalOps from "@/routes/ops/journal-ops";
import periodOps from "@/routes/ops/period-ops";
import auditLogs from "@/routes/ops/audit-logs";
import reports from "@/routes/reports";

// ────────────────────────────────────────────
// Operations API v1 — /api/ops/v1
// Business operations & reports
// ────────────────────────────────────────────

const opsApp = new OpenAPIHono().basePath("/api/ops/v1");

opsApp.use("*", logger());
opsApp.onError(errorHandler);

// Context middleware
opsApp.use("*", contextMiddleware);

// Audit role enforcement
opsApp.use("*", requireWritable());

// Business operation routes
opsApp.route("/journals", journalOps);
opsApp.route("/periods", periodOps);

// Audit log routes
opsApp.route("/audit-logs", auditLogs);

// Report routes
opsApp.route("/reports", reports);

// OpenAPI spec
opsApp.doc("/doc", {
  openapi: "3.1.0",
  info: {
    title: "data-stockflow Operations API",
    version: "1.0.0",
    description: `Business operations API for the append-only double-entry bookkeeping system.

Provides higher-level operations that compose atomic API primitives:
- **Journal reversal** — Generate full-amount counter-entries
- **Period close/reopen** — Fiscal period lifecycle management
- **Reports** — Aggregated financial data (balances, trial balance, ledger)

## Roles

| Role | Access |
|------|--------|
| audit | Read-only (reports only) |
| tenant | Period close/reopen |
| admin | All operations + reports |
| user | Journal reverse (normal type only) + reports |`,
  },
});

// Scalar API Reference UI
opsApp.get(
  "/reference",
  apiReference({
    url: "/api/ops/v1/doc",
    theme: "kepler",
  })
);

export default opsApp;
