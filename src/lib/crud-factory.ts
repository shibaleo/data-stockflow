/**
 * Generic CRUD factory for append-only master entities.
 *
 * Eliminates repetitive route definitions and handler boilerplate across
 * books, accounts, tags, departments, counterparties, fiscal-periods, roles, users.
 */
import { createApp } from "@/lib/create-app";
import { createRoute } from "@hono/zod-openapi";
import { z } from "@hono/zod-openapi";
import { db } from "@/lib/db";
import { listCurrent, getCurrent, getMaxRevision, listHistory } from "@/lib/append-only";
import { errorSchema, messageSchema, dataSchema } from "@/lib/validators";
import { requireRole } from "@/middleware/guards";
import { recordAudit, type AuditEntityType } from "@/lib/audit";
import { computeMasterHashes } from "@/lib/entity-hash";
import type { Context } from "hono";
import type { AppVariables, UserRole } from "@/middleware/context";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DrizzleTable = any;
type Ctx = Context<{ Variables: AppVariables }>;
type BaseRow = { key: number; revision: number; created_at: Date | string; revision_hash: string };

// ── Response mapper ──

const INTERNAL_FIELDS = new Set([
  "valid_from", "valid_to", "lines_hash",
  "prev_revision_hash", "revision_hash", "created_by",
]);

/**
 * Create a mapper that transforms DB rows → API responses.
 * - `key` → `id`
 * - columns in `renameKeys` get `*_key` → `*_id`
 * - columns in `excludeKeys` are dropped
 * - Date columns (created_at, start_date, end_date) become ISO strings
 * - internal hash/audit columns are always stripped
 */
export function createMapper<T extends BaseRow>(
  excludeKeys: string[] = [],
  renameKeys: string[] = [],
) {
  const excludeSet = new Set([...INTERNAL_FIELDS, ...excludeKeys]);
  const renameMap = new Map(renameKeys.map((k) => [k, k.replace(/_key$/, "_id")]));

  return (row: T): Record<string, unknown> => {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(row)) {
      if (k === "key") result.id = v;
      else if (excludeSet.has(k)) continue;
      else if (renameMap.has(k)) result[renameMap.get(k)!] = v;
      else if (k === "created_at" || k === "start_date" || k === "end_date")
        result[k] = v instanceof Date ? v.toISOString() : String(v);
      else result[k] = v;
    }
    return result;
  };
}

// ── Route definition factory ──

function jc<T extends z.ZodType>(schema: T) {
  return { content: { "application/json": { schema } } };
}

export function defineCrudRoutes(
  tag: string,
  idParam: string,
  responseSchema: z.ZodType,
  createSchema: z.ZodType,
  updateSchema: z.ZodType,
) {
  const idObj = z.object({ [idParam]: z.string() });
  const singular = tag.toLowerCase().replace(/s$/, "");

  return {
    list: createRoute({
      method: "get" as const, path: "/", tags: [tag], summary: `List ${tag.toLowerCase()}`,
      responses: { 200: { description: "Success", ...jc(z.object({ data: z.array(responseSchema) })) } },
    }),
    get: createRoute({
      method: "get" as const, path: `/{${idParam}}`, tags: [tag], summary: `Get ${singular}`,
      request: { params: idObj },
      responses: {
        200: { description: "Success", ...jc(dataSchema(responseSchema)) },
        404: { description: "Not found", ...jc(errorSchema) },
      },
    }),
    create: createRoute({
      method: "post" as const, path: "/", tags: [tag], summary: `Create ${singular}`,
      request: { body: jc(createSchema) },
      responses: {
        201: { description: "Created", ...jc(dataSchema(responseSchema)) },
        409: { description: "Conflict", ...jc(errorSchema) },
      },
    }),
    update: createRoute({
      method: "put" as const, path: `/{${idParam}}`, tags: [tag], summary: `Update ${singular}`,
      request: { params: idObj, body: jc(updateSchema) },
      responses: {
        200: { description: "Updated", ...jc(dataSchema(responseSchema)) },
        403: { description: "Forbidden", ...jc(errorSchema) },
        404: { description: "Not found", ...jc(errorSchema) },
      },
    }),
    del: createRoute({
      method: "delete" as const, path: `/{${idParam}}`, tags: [tag], summary: `Deactivate ${singular}`,
      request: { params: idObj },
      responses: {
        200: { description: "Deactivated", ...jc(messageSchema) },
        404: { description: "Not found", ...jc(errorSchema) },
        422: { description: "Already deactivated", ...jc(errorSchema) },
      },
    }),
    history: createRoute({
      method: "get" as const, path: `/{${idParam}}/history`, tags: [tag], summary: `${tag} history`,
      request: { params: idObj },
      responses: { 200: { description: "Success", ...jc(z.object({ data: z.array(responseSchema) })) } },
    }),
  };
}

// ── Handler registration ──

interface CrudConfig<T extends BaseRow> {
  table: DrizzleTable;
  tableName: string;
  viewName: string;
  historyView: string;
  entityType: AuditEntityType;
  idParam: string;
  mapRow: (row: T) => Record<string, unknown>;
  scope: (c: Ctx) => { tenant_key: number } | { book_key: number } | null;
  buildCreate: (body: Record<string, unknown>, c: Ctx) => Record<string, unknown>;
  hashCreate: (body: Record<string, unknown>) => Record<string, unknown>;
  buildUpdate: (body: Record<string, unknown>, current: T, c: Ctx) => Record<string, unknown>;
  hashUpdate: (body: Record<string, unknown>, current: T) => Record<string, unknown>;
  buildDeactivate: (current: T, c: Ctx) => Record<string, unknown>;
  hashDeactivate: (current: T) => Record<string, unknown>;
  writeRoles?: UserRole[];
}

export function registerCrudHandlers<T extends BaseRow>(
  app: ReturnType<typeof createApp>,
  routes: ReturnType<typeof defineCrudRoutes>,
  config: CrudConfig<T>,
) {
  const {
    table, tableName, viewName, historyView, entityType,
    idParam, mapRow, scope,
    buildCreate, hashCreate,
    buildUpdate, hashUpdate,
    buildDeactivate, hashDeactivate,
    writeRoles = ["user"],
  } = config;

  const writeGuard = requireRole(...writeRoles);

  const getKey = (c: Ctx) => Number(c.req.param(idParam));
  const getFilter = (c: Ctx, entityKey: number) => {
    const s = scope(c);
    return s ? { ...s, key: entityKey } : { key: entityKey };
  };

  // LIST
  app.openapi(routes.list, async (c) => {
    const rows = await listCurrent<T>(viewName, scope(c));
    return c.json({ data: rows.map(mapRow) }, 200);
  });

  // GET
  app.openapi(routes.get, async (c) => {
    const row = await getCurrent<T>(viewName, getFilter(c, getKey(c)));
    if (!row) return c.json({ error: "Not found" }, 404);
    return c.json({ data: mapRow(row) }, 200);
  });

  // CREATE
  app.use(routes.create.getRoutingPath(), writeGuard);
  app.openapi(routes.create, async (c) => {
    const body = c.req.valid("json") as Record<string, unknown>;
    const hashes = computeMasterHashes(hashCreate(body), null);
    const [created] = await db.insert(table).values({ ...buildCreate(body, c), ...hashes }).returning();
    recordAudit(c, { action: "create", entityType, entityKey: created.key });
    return c.json({ data: mapRow(created as unknown as T) }, 201);
  });

  // UPDATE
  app.use(routes.update.getRoutingPath(), writeGuard);
  app.openapi(routes.update, async (c) => {
    const entityKey = getKey(c);
    const body = c.req.valid("json") as Record<string, unknown>;
    const current = await getCurrent<T>(viewName, getFilter(c, entityKey));
    if (!current) return c.json({ error: "Not found" }, 404);
    const maxRev = await getMaxRevision(tableName, entityKey);
    const hashes = computeMasterHashes(hashUpdate(body, current), (current as BaseRow).revision_hash);
    const [updated] = await db.insert(table).values({
      key: entityKey, revision: maxRev + 1, ...buildUpdate(body, current, c), ...hashes,
    }).returning();
    const action = (body.is_active === false) ? "deactivate" as const : "update" as const;
    recordAudit(c, { action, entityType, entityKey, revision: maxRev + 1 });
    return c.json({ data: mapRow(updated as unknown as T) }, 200);
  });

  // DELETE (deactivate)
  app.use(routes.del.getRoutingPath(), writeGuard);
  app.openapi(routes.del, async (c) => {
    const entityKey = getKey(c);
    const current = await getCurrent<T>(viewName, getFilter(c, entityKey));
    if (!current) return c.json({ error: "Not found" }, 404);
    if ((current as T & { is_active?: boolean }).is_active === false) {
      return c.json({ error: "Already deactivated" }, 422);
    }
    const maxRev = await getMaxRevision(tableName, entityKey);
    const hashes = computeMasterHashes(hashDeactivate(current), (current as BaseRow).revision_hash);
    await db.insert(table).values({
      key: entityKey, revision: maxRev + 1, ...buildDeactivate(current, c), is_active: false, ...hashes,
    });
    recordAudit(c, { action: "deactivate", entityType, entityKey, revision: maxRev + 1 });
    return c.json({ message: "Deactivated" }, 200);
  });

  // HISTORY
  app.openapi(routes.history, async (c) => {
    const rows = await listHistory<T>(historyView, getKey(c));
    return c.json({ data: rows.map(mapRow) }, 200);
  });
}
