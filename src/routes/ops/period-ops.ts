import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import { prisma } from "@/lib/prisma";
import { getCurrent, getMaxRevision } from "@/lib/append-only";
import {
  codeParamSchema,
  errorSchema,
  dataSchema,
  fiscalPeriodResponseSchema,
} from "@/lib/validators";
import type { AppVariables } from "@/middleware/context";
import { requireTenant, requireAuth, requireRole } from "@/middleware/guards";
import type { CurrentFiscalPeriod } from "@/lib/types";

const app = new OpenAPIHono<{ Variables: AppVariables }>();

app.use("*", requireTenant(), requireAuth());

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
  const tenantId = c.get("tenantId");
  const userId = c.get("userId");
  const { code } = c.req.valid("param");

  const current = await getCurrent<CurrentFiscalPeriod>(
    "current_fiscal_period",
    { tenant_id: tenantId, code }
  );
  if (!current) return c.json({ error: "Fiscal period not found" }, 404);

  if (current.status !== "open") {
    return c.json(
      { error: `Cannot close: current status is '${current.status}', expected 'open'` },
      422
    );
  }

  const maxRev = await getMaxRevision("fiscal_period", {
    tenant_id: tenantId,
    code,
  });

  const updated = await prisma.fiscalPeriod.create({
    data: {
      tenant_id: tenantId,
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
  const tenantId = c.get("tenantId");
  const userId = c.get("userId");
  const { code } = c.req.valid("param");

  const current = await getCurrent<CurrentFiscalPeriod>(
    "current_fiscal_period",
    { tenant_id: tenantId, code }
  );
  if (!current) return c.json({ error: "Fiscal period not found" }, 404);

  if (current.status !== "closed") {
    return c.json(
      { error: `Cannot reopen: current status is '${current.status}', expected 'closed'` },
      422
    );
  }

  const maxRev = await getMaxRevision("fiscal_period", {
    tenant_id: tenantId,
    code,
  });

  const updated = await prisma.fiscalPeriod.create({
    data: {
      tenant_id: tenantId,
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

  return c.json({ data: updated }, 200);
});

export default app;
