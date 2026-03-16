/**
 * Period Operations — close / reopen / finalize
 *
 * POST /periods/:periodId/close
 * POST /periods/:periodId/reopen
 * POST /periods/:periodId/finalize
 */
import { createApp } from "@/lib/create-app";
import { createRoute, z } from "@hono/zod-openapi";
import { db } from "@/lib/db";
import { period } from "@/lib/db/schema";
import { getCurrent, getMaxRevision } from "@/lib/append-only";
import {
  errorSchema,
  dataSchema,
  periodResponseSchema,
} from "@/lib/validators";
import { requireTenant, requireAuth, requireRole } from "@/middleware/guards";
import { computeMasterHashes } from "@/lib/entity-hash";
import type { CurrentPeriod } from "@/lib/types";
import { recordAudit } from "@/lib/audit";
import { recordEvent } from "@/lib/event-log";
import { createMapper } from "@/lib/crud-factory";

const app = createApp();

app.use("*", requireTenant(), requireAuth());

const mapFp = createMapper<CurrentPeriod>([], ["tenant_key", "parent_period_key"]);

const periodIdParam = z.object({ periodId: z.string() });

function dateStr(d: Date | string): string {
  return d instanceof Date ? d.toISOString() : String(d);
}

// ── Close ──

const close = createRoute({
  method: "post",
  path: "/{periodId}/close",
  tags: ["Period Operations"],
  summary: "Close a period",
  request: { params: periodIdParam },
  responses: {
    200: { description: "Period closed", content: { "application/json": { schema: dataSchema(periodResponseSchema) } } },
    404: { description: "Not found", content: { "application/json": { schema: errorSchema } } },
    422: { description: "Invalid state", content: { "application/json": { schema: errorSchema } } },
  },
});

app.use(close.getRoutingPath(), requireRole("admin"));
app.openapi(close, async (c) => {
  const tenantKey = c.get("tenantKey");
  const userKey = c.get("userKey");
  const periodKey = Number(c.req.param("periodId"));

  const current = await getCurrent<CurrentPeriod>(
    "current_period",
    { tenant_key: tenantKey, key: periodKey }
  );
  if (!current) return c.json({ error: "Period not found" }, 404);
  if (current.status !== "open") {
    return c.json({ error: `Cannot close: current status is '${current.status}'` }, 422);
  }

  const maxRev = await getMaxRevision("period", periodKey);
  const hashes = computeMasterHashes(
    { code: current.code, name: current.name, start_date: dateStr(current.start_date), end_date: dateStr(current.end_date), status: "closed" },
    current.revision_hash,
  );

  const [updated] = await db.insert(period).values({
    key: periodKey, revision: maxRev + 1,
    tenant_key: tenantKey, code: current.code, name: current.name,
    start_date: new Date(dateStr(current.start_date)), end_date: new Date(dateStr(current.end_date)),
    status: "closed", parent_period_key: current.parent_period_key,
    created_by: userKey, ...hashes,
  }).returning();

  recordAudit(c, { action: "close", entityType: "period", entityKey: periodKey, revision: maxRev + 1 });
  recordEvent(c, {
    action: "close", entityType: "period", entityKey: periodKey,
    entityName: current.name,
    summary: `期間「${current.name}」を締めました`,
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return c.json({ data: mapFp(updated as unknown as CurrentPeriod) } as any, 200);
});

// ── Reopen ──

const reopen = createRoute({
  method: "post",
  path: "/{periodId}/reopen",
  tags: ["Period Operations"],
  summary: "Reopen a closed period",
  request: { params: periodIdParam },
  responses: {
    200: { description: "Period reopened", content: { "application/json": { schema: dataSchema(periodResponseSchema) } } },
    404: { description: "Not found", content: { "application/json": { schema: errorSchema } } },
    422: { description: "Invalid state", content: { "application/json": { schema: errorSchema } } },
  },
});

app.use(reopen.getRoutingPath(), requireRole("admin"));
app.openapi(reopen, async (c) => {
  const tenantKey = c.get("tenantKey");
  const userKey = c.get("userKey");
  const periodKey = Number(c.req.param("periodId"));

  const current = await getCurrent<CurrentPeriod>(
    "current_period",
    { tenant_key: tenantKey, key: periodKey }
  );
  if (!current) return c.json({ error: "Period not found" }, 404);
  if (current.status !== "closed") {
    return c.json({ error: `Cannot reopen: current status is '${current.status}'` }, 422);
  }

  const maxRev = await getMaxRevision("period", periodKey);
  const hashes = computeMasterHashes(
    { code: current.code, name: current.name, start_date: dateStr(current.start_date), end_date: dateStr(current.end_date), status: "open" },
    current.revision_hash,
  );

  const [updated] = await db.insert(period).values({
    key: periodKey, revision: maxRev + 1,
    tenant_key: tenantKey, code: current.code, name: current.name,
    start_date: new Date(dateStr(current.start_date)), end_date: new Date(dateStr(current.end_date)),
    status: "open", parent_period_key: current.parent_period_key,
    created_by: userKey, ...hashes,
  }).returning();

  recordAudit(c, { action: "reopen", entityType: "period", entityKey: periodKey, revision: maxRev + 1 });
  recordEvent(c, {
    action: "reopen", entityType: "period", entityKey: periodKey,
    entityName: current.name,
    summary: `期間「${current.name}」を再開しました`,
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return c.json({ data: mapFp(updated as unknown as CurrentPeriod) } as any, 200);
});

// ── Finalize ──

const finalize = createRoute({
  method: "post",
  path: "/{periodId}/finalize",
  tags: ["Period Operations"],
  summary: "Finalize a closed period (irreversible)",
  request: { params: periodIdParam },
  responses: {
    200: { description: "Period finalized", content: { "application/json": { schema: dataSchema(periodResponseSchema) } } },
    404: { description: "Not found", content: { "application/json": { schema: errorSchema } } },
    422: { description: "Invalid state", content: { "application/json": { schema: errorSchema } } },
  },
});

app.use(finalize.getRoutingPath(), requireRole("admin"));
app.openapi(finalize, async (c) => {
  const tenantKey = c.get("tenantKey");
  const userKey = c.get("userKey");
  const periodKey = Number(c.req.param("periodId"));

  const current = await getCurrent<CurrentPeriod>(
    "current_period",
    { tenant_key: tenantKey, key: periodKey }
  );
  if (!current) return c.json({ error: "Period not found" }, 404);
  if (current.status !== "closed") {
    return c.json({ error: `Cannot finalize: current status is '${current.status}'. Must be 'closed' first.` }, 422);
  }

  const maxRev = await getMaxRevision("period", periodKey);
  const hashes = computeMasterHashes(
    { code: current.code, name: current.name, start_date: dateStr(current.start_date), end_date: dateStr(current.end_date), status: "finalized" },
    current.revision_hash,
  );

  const [updated] = await db.insert(period).values({
    key: periodKey, revision: maxRev + 1,
    tenant_key: tenantKey, code: current.code, name: current.name,
    start_date: new Date(dateStr(current.start_date)), end_date: new Date(dateStr(current.end_date)),
    status: "finalized", parent_period_key: current.parent_period_key,
    created_by: userKey, ...hashes,
  }).returning();

  recordAudit(c, { action: "finalize", entityType: "period", entityKey: periodKey, revision: maxRev + 1 });
  recordEvent(c, {
    action: "finalize", entityType: "period", entityKey: periodKey,
    entityName: current.name,
    summary: `期間「${current.name}」を確定しました`,
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return c.json({ data: mapFp(updated as unknown as CurrentPeriod) } as any, 200);
});

export default app;
