import { OpenAPIHono } from "@hono/zod-openapi";
import { logger } from "hono/logger";
import { apiReference } from "@scalar/hono-api-reference";
import { contextMiddleware } from "@/middleware/context";
import { requireWritable } from "@/middleware/guards";
import { errorHandler } from "@/middleware/error-handler";
import health from "@/routes/health";
import auth from "@/routes/auth";
import roles from "@/routes/roles";
import users from "@/routes/users";
import books from "@/routes/books";
import accounts from "@/routes/accounts";
import tags from "@/routes/tags";
import departments from "@/routes/departments";
import fiscalPeriods from "@/routes/fiscal-periods";
import counterparties from "@/routes/counterparties";
import vouchers from "@/routes/vouchers";
import journals from "@/routes/journals";
import journalOps from "@/routes/ops/journal-ops";
import periodOps from "@/routes/ops/period-ops";
import auditLogs from "@/routes/ops/audit-logs";
import integrity from "@/routes/ops/integrity";
import voucherTypes from "@/routes/voucher-types";
import journalTypes from "@/routes/journal-types";
import reports from "@/routes/reports";

// ────────────────────────────────────────────
// Unified API v1 — /api/v1
// ────────────────────────────────────────────

const app = new OpenAPIHono({
  defaultHook: (result, c) => {
    if (!result.success) {
      const firstIssue = result.error.issues[0];
      const msg = firstIssue
        ? `${firstIssue.path.join(".")}: ${firstIssue.message}`
        : "Validation error";
      return c.json({ error: msg }, 400);
    }
  },
}).basePath("/api/v1");

app.use("*", logger());
app.onError(errorHandler);

// Public routes (no auth)
app.route("/health", health);
app.route("/auth", auth);

// Context middleware for all subsequent routes
app.use("*", contextMiddleware);

// Audit role enforcement: read-only for audit users
app.use("*", requireWritable());

// Platform-scoped
app.route("/roles", roles);

// Tenant-scoped master routes
app.route("/users", users);
app.route("/books", books);
app.route("/tags", tags);
app.route("/departments", departments);
app.route("/counterparties", counterparties);
app.route("/voucher-types", voucherTypes);

// Book-scoped master routes (requireBook middleware is inside each route)
app.route("/books/:bookId/accounts", accounts);
app.route("/books/:bookId/fiscal-periods", fiscalPeriods);
app.route("/books/:bookId/journal-types", journalTypes);
app.route("/books/:bookId/reports", reports);

// Transaction routes (tenant-scoped)
app.route("/vouchers", vouchers);
app.route("/vouchers/:voucherId/journals", journals);

// Operations
app.route("/journals", journalOps);
app.route("/books/:bookId/periods", periodOps);

// Audit & integrity
app.route("/audit-logs", auditLogs);
app.route("/integrity", integrity);

// OpenAPI spec
app.doc("/doc", {
  openapi: "3.1.0",
  info: {
    title: "data-stockflow API",
    version: "2.0.0",
    description: `Unified API for the append-only double-entry bookkeeping system.

## Key Concepts

- **BIGINT keys**: All entities use auto-incrementing BIGINT keys exposed as \`id\` in API responses.
- **Voucher → Journal 2-layer**: Vouchers group one or more journals. Journals contain lines and tags.
- **Append-only**: All writes are INSERT-only with incrementing revision numbers. No rows are ever updated or deleted.
- **Hash chains**: Header chain on vouchers, revision chain on all entities for tamper detection.

## Double-Entry Convention

Journal lines use standard double-entry format:
- **amount**: Always positive.
- **side**: "debit" or "credit".
- Debit total must equal credit total per journal.

## Resource Hierarchy

- \`/roles\` — Platform-scoped
- \`/users\`, \`/books\`, \`/tags\`, \`/departments\`, \`/counterparties\`, \`/voucher-types\` — Tenant-scoped
- \`/books/{bookId}/accounts\`, \`/books/{bookId}/fiscal-periods\`, \`/books/{bookId}/journal-types\` — Book-scoped
- \`/vouchers\` → \`/vouchers/{voucherId}/journals\` — Transaction layer`,
  },
});

// Scalar API Reference UI
app.get(
  "/reference",
  apiReference({
    url: "/api/v1/doc",
    theme: "kepler",
  })
);

export default app;
