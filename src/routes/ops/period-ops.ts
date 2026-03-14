/**
 * Period Operations — close / reopen
 *
 * POST /periods/:periodId/close
 * POST /periods/:periodId/reopen
 */
import { createApp } from "@/lib/create-app";
import { createRoute, z } from "@hono/zod-openapi";
import { db } from "@/lib/db";
import { fiscalPeriod } from "@/lib/db/schema";
import { getCurrent, getMaxRevision } from "@/lib/append-only";
import {
  errorSchema,
  dataSchema,
  fiscalPeriodResponseSchema,
} from "@/lib/validators";
import { requireAuth, requireRole, requireBook } from "@/middleware/guards";
import { computeMasterHashes } from "@/lib/entity-hash";
import type { CurrentFiscalPeriod } from "@/lib/types";
import { recordAudit } from "@/lib/audit";
import { createMapper } from "@/lib/crud-factory";

const app = createApp();

app.use("*", requireAuth(), requireBook());

const mapFp = createMapper<CurrentFiscalPeriod>([], ["book_key", "parent_period_key"]);

const periodIdParam = z.object({ periodId: z.string() });

// ── Close ──

const close = createRoute({
  method: "post",
  path: "/{periodId}/close",
  tags: ["Period Operations"],
  summary: "Close a fiscal period",
  request: { params: periodIdParam },
  responses: {
    200: { description: "Period closed", content: { "application/json": { schema: dataSchema(fiscalPeriodResponseSchema) } } },
    404: { description: "Not found", content: { "application/json": { schema: errorSchema } } },
    422: { description: "Invalid state", content: { "application/json": { schema: errorSchema } } },
  },
});

app.use(close.getRoutingPath(), requireRole("admin"));
app.openapi(close, async (c) => {
  const bookKey = c.get("bookKey");
  const userKey = c.get("userKey");
  const periodKey = Number(c.req.param("periodId"));

  const current = await getCurrent<CurrentFiscalPeriod>(
    "current_fiscal_period",
    { book_key: bookKey, key: periodKey }
  );
  if (!current) return c.json({ error: "Fiscal period not found" }, 404);
  if (current.status !== "open") {
    return c.json({ error: `Cannot close: current status is '${current.status}'` }, 422);
  }

  const maxRev = await getMaxRevision("fiscal_period", periodKey);
  const hashes = computeMasterHashes(
    { code: current.code, start_date: current.start_date.toISOString(), end_date: current.end_date.toISOString(), status: "closed" },
    current.revision_hash,
  );

  const [updated] = await db.insert(fiscalPeriod).values({
    key: periodKey, revision: maxRev + 1,
    book_key: bookKey, code: current.code,
    start_date: current.start_date, end_date: current.end_date,
    status: "closed", parent_period_key: current.parent_period_key,
    created_by: userKey, ...hashes,
  }).returning();

  recordAudit(c, { action: "close", entityType: "fiscal_period", entityKey: periodKey, revision: maxRev + 1 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return c.json({ data: mapFp(updated as unknown as CurrentFiscalPeriod) } as any, 200);
});

// ── Reopen ──

const reopen = createRoute({
  method: "post",
  path: "/{periodId}/reopen",
  tags: ["Period Operations"],
  summary: "Reopen a closed fiscal period",
  request: { params: periodIdParam },
  responses: {
    200: { description: "Period reopened", content: { "application/json": { schema: dataSchema(fiscalPeriodResponseSchema) } } },
    404: { description: "Not found", content: { "application/json": { schema: errorSchema } } },
    422: { description: "Invalid state", content: { "application/json": { schema: errorSchema } } },
  },
});

app.use(reopen.getRoutingPath(), requireRole("admin"));
app.openapi(reopen, async (c) => {
  const bookKey = c.get("bookKey");
  const userKey = c.get("userKey");
  const periodKey = Number(c.req.param("periodId"));

  const current = await getCurrent<CurrentFiscalPeriod>(
    "current_fiscal_period",
    { book_key: bookKey, key: periodKey }
  );
  if (!current) return c.json({ error: "Fiscal period not found" }, 404);
  if (current.status !== "closed") {
    return c.json({ error: `Cannot reopen: current status is '${current.status}'` }, 422);
  }

  const maxRev = await getMaxRevision("fiscal_period", periodKey);
  const hashes = computeMasterHashes(
    { code: current.code, start_date: current.start_date.toISOString(), end_date: current.end_date.toISOString(), status: "open" },
    current.revision_hash,
  );

  const [updated] = await db.insert(fiscalPeriod).values({
    key: periodKey, revision: maxRev + 1,
    book_key: bookKey, code: current.code,
    start_date: current.start_date, end_date: current.end_date,
    status: "open", parent_period_key: current.parent_period_key,
    created_by: userKey, ...hashes,
  }).returning();

  recordAudit(c, { action: "reopen", entityType: "fiscal_period", entityKey: periodKey, revision: maxRev + 1 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return c.json({ data: mapFp(updated as unknown as CurrentFiscalPeriod) } as any, 200);
});

export default app;
