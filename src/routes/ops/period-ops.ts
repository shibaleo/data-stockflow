import { createApp } from "@/lib/create-app";
import { createRoute } from "@hono/zod-openapi";
import { prisma } from "@/lib/prisma";
import { getCurrent, getMaxRevision } from "@/lib/append-only";
import {
  codeParamSchema,
  errorSchema,
  dataSchema,
  fiscalPeriodResponseSchema,
} from "@/lib/validators";
import { requireTenant, requireAuth, requireRole, requireBook } from "@/middleware/guards";
import type { CurrentFiscalPeriod } from "@/lib/types";
import { recordAudit } from "@/lib/audit";

const app = createApp();

app.use("*", requireTenant(), requireAuth(), requireBook());

// ────────────────────────────────────────────
// POST /periods/{code}/close
// ────────────────────────────────────────────

const close = createRoute({
  method: "post",
  path: "/{code}/close",
  tags: ["Period Operations"],
  summary: "Close a fiscal period",
  description:
    "Transitions a fiscal period from 'open' to 'closed'. " +
    "Closed periods reject new journal entries.",
  request: { params: codeParamSchema },
  responses: {
    200: {
      description: "Period closed",
      content: {
        "application/json": {
          schema: dataSchema(fiscalPeriodResponseSchema),
        },
      },
    },
    403: {
      description: "Forbidden",
      content: { "application/json": { schema: errorSchema } },
    },
    404: {
      description: "Not found",
      content: { "application/json": { schema: errorSchema } },
    },
    422: {
      description: "Invalid state transition",
      content: { "application/json": { schema: errorSchema } },
    },
  },
});

app.use(close.getRoutingPath(), requireRole("tenant", "admin"));
app.openapi(close, async (c) => {
  const bookCode = c.get("bookCode");
  const userId = c.get("userId");
  const { code } = c.req.valid("param");

  const current = await getCurrent<CurrentFiscalPeriod>(
    "current_fiscal_period",
    { book_code: bookCode, code }
  );
  if (!current) return c.json({ error: "Fiscal period not found" }, 404);

  if (current.status !== "open") {
    return c.json(
      { error: `Cannot close: current status is '${current.status}', expected 'open'` },
      422
    );
  }

  const maxRev = await getMaxRevision("fiscal_period", {
    book_code: bookCode,
    code,
  });

  const updated = await prisma.fiscalPeriod.create({
    data: {
      book_code: bookCode,
      code,
      display_code: current.display_code,
      revision: maxRev + 1,
      created_by: userId,
      fiscal_year: current.fiscal_year,
      period_no: current.period_no,
      start_date: current.start_date,
      end_date: current.end_date,
      status: "closed",
    },
  });

  recordAudit(c, { action: "close", entityType: "fiscal_period", entityCode: code, revision: maxRev + 1 });
  return c.json({ data: updated }, 200);
});

// ────────────────────────────────────────────
// POST /periods/{code}/reopen
// ────────────────────────────────────────────

const reopen = createRoute({
  method: "post",
  path: "/{code}/reopen",
  tags: ["Period Operations"],
  summary: "Reopen a closed fiscal period",
  description:
    "Transitions a fiscal period from 'closed' back to 'open'. " +
    "Requires tenant or admin role.",
  request: { params: codeParamSchema },
  responses: {
    200: {
      description: "Period reopened",
      content: {
        "application/json": {
          schema: dataSchema(fiscalPeriodResponseSchema),
        },
      },
    },
    403: {
      description: "Forbidden",
      content: { "application/json": { schema: errorSchema } },
    },
    404: {
      description: "Not found",
      content: { "application/json": { schema: errorSchema } },
    },
    422: {
      description: "Invalid state transition",
      content: { "application/json": { schema: errorSchema } },
    },
  },
});

app.use(reopen.getRoutingPath(), requireRole("tenant", "admin"));
app.openapi(reopen, async (c) => {
  const bookCode = c.get("bookCode");
  const userId = c.get("userId");
  const { code } = c.req.valid("param");

  const current = await getCurrent<CurrentFiscalPeriod>(
    "current_fiscal_period",
    { book_code: bookCode, code }
  );
  if (!current) return c.json({ error: "Fiscal period not found" }, 404);

  if (current.status !== "closed") {
    return c.json(
      { error: `Cannot reopen: current status is '${current.status}', expected 'closed'` },
      422
    );
  }

  const maxRev = await getMaxRevision("fiscal_period", {
    book_code: bookCode,
    code,
  });

  const updated = await prisma.fiscalPeriod.create({
    data: {
      book_code: bookCode,
      code,
      display_code: current.display_code,
      revision: maxRev + 1,
      created_by: userId,
      fiscal_year: current.fiscal_year,
      period_no: current.period_no,
      start_date: current.start_date,
      end_date: current.end_date,
      status: "open",
    },
  });

  recordAudit(c, { action: "reopen", entityType: "fiscal_period", entityCode: code, revision: maxRev + 1 });
  return c.json({ data: updated }, 200);
});

export default app;
