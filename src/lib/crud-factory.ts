/**
 * Generic CRUD factory for append-only master entities.
 *
 * Eliminates repetitive route definitions and handler boilerplate across
 * books, accounts, categories, departments, counterparties, projects, roles, users.
 */
import { createApp } from "@/lib/create-app";
import { createRoute } from "@hono/zod-openapi";
import { z } from "@hono/zod-openapi";
import { db } from "@/lib/db";
import { entityColor } from "@/lib/db/schema";
import { listCurrent, getCurrent, listLatest, getLatest, getMaxRevision, listHistory, encodeCursor, decodeCursor } from "@/lib/append-only";
import { errorSchema, messageSchema, dataSchema, paginatedSchema, listQuerySchema } from "@/lib/validators";
import { eq, and, inArray } from "drizzle-orm";
import { requireRole } from "@/middleware/guards";
import { recordAudit, type AuditEntityType } from "@/lib/audit";
import { recordEvent, computeChanges } from "@/lib/event-log";
import { computeMasterHashes } from "@/lib/entity-hash";
import { authorityCheck } from "@/lib/authority";
import { ENTITY_PERMISSIONS } from "@/lib/permissions";
import type { Context } from "hono";
import type { AppVariables } from "@/middleware/context";

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
        result[k] = v == null ? null : v instanceof Date ? v.toISOString() : String(v);
      else result[k] = v;
    }
    return result;
  };
}

// ── Color helpers ──

async function fetchColorMap(entType: string, keys: number[]): Promise<Map<number, string>> {
  if (keys.length === 0) return new Map();
  const rows = await db
    .select({ entity_key: entityColor.entity_key, color: entityColor.color })
    .from(entityColor)
    .where(and(eq(entityColor.entity_type, entType), inArray(entityColor.entity_key, keys)));
  return new Map(rows.map((r: { entity_key: number; color: string }) => [r.entity_key, r.color]));
}

function attachColors(mapped: Record<string, unknown>[], colorMap: Map<number, string>) {
  for (const row of mapped) {
    const id = row.id as number;
    row.color_hex = colorMap.get(id) ?? null;
  }
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
      request: { query: listQuerySchema },
      responses: { 200: { description: "Success", ...jc(paginatedSchema(responseSchema)) } },
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
        403: { description: "Forbidden", ...jc(errorSchema) },
        404: { description: "Not found", ...jc(errorSchema) },
        422: { description: "Already deactivated", ...jc(errorSchema) },
      },
    }),
    history: createRoute({
      method: "get" as const, path: `/{${idParam}}/history`, tags: [tag], summary: `${tag} history`,
      request: { params: idObj },
      responses: { 200: { description: "Success", ...jc(z.object({ data: z.array(responseSchema) })) } },
    }),
    restore: createRoute({
      method: "post" as const, path: `/{${idParam}}/restore`, tags: [tag], summary: `Restore ${singular}`,
      request: { params: idObj },
      responses: {
        200: { description: "Restored", ...jc(dataSchema(responseSchema)) },
        403: { description: "Forbidden", ...jc(errorSchema) },
        404: { description: "Not found", ...jc(errorSchema) },
        422: { description: "Already active", ...jc(errorSchema) },
      },
    }),
    purge: createRoute({
      method: "post" as const, path: `/{${idParam}}/purge`, tags: [tag], summary: `Purge ${singular}`,
      request: { params: idObj },
      responses: {
        200: { description: "Purged", ...jc(messageSchema) },
        403: { description: "Forbidden", ...jc(errorSchema) },
        404: { description: "Not found", ...jc(errorSchema) },
        422: { description: "Cannot purge", ...jc(errorSchema) },
      },
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
  entityLabel: string; // e.g. "帳簿", "科目", "タグ"
  idParam: string;
  mapRow: (row: T) => Record<string, unknown>;
  scope: (c: Ctx) => { tenant_key: number } | { book_key: number } | null;
  buildCreate: (body: Record<string, unknown>, c: Ctx) => Record<string, unknown>;
  hashCreate: (body: Record<string, unknown>) => Record<string, unknown>;
  buildUpdate: (body: Record<string, unknown>, current: T, c: Ctx) => Record<string, unknown>;
  hashUpdate: (body: Record<string, unknown>, current: T) => Record<string, unknown>;
  buildDeactivate: (current: T, c: Ctx) => Record<string, unknown>;
  hashDeactivate: (current: T) => Record<string, unknown>;
  /** undefined = purge not allowed; function returning null = allowed; returning string = denied with reason */
  canPurge?: (entityKey: number) => Promise<string | null>;
  /** If true, check authority_role_key on update/deactivate/restore/purge */
  hasAuthority?: boolean;
}

export function registerCrudHandlers<T extends BaseRow>(
  app: ReturnType<typeof createApp>,
  routes: ReturnType<typeof defineCrudRoutes>,
  config: CrudConfig<T>,
) {
  const {
    table, tableName, viewName, historyView, entityType, entityLabel,
    idParam, mapRow, scope,
    buildCreate, hashCreate,
    buildUpdate, hashUpdate,
    buildDeactivate, hashDeactivate,
    canPurge,
    hasAuthority = false,
  } = config;

  const perms = ENTITY_PERMISSIONS[entityType];
  const createGuard = requireRole(...perms.create);
  const updateGuard = requireRole(...perms.update);
  const deleteGuard = requireRole(...perms.delete);
  const restoreGuard = requireRole(...perms.restore);
  const purgeGuard = requireRole(...perms.purge);

  const getKey = (c: Ctx) => Number(c.req.param(idParam));
  // platform role bypasses tenant/book scope filter
  const resolveScope = (c: Ctx) => c.get("userRole") === "platform" ? null : scope(c);
  const getFilter = (c: Ctx, entityKey: number) => {
    const s = resolveScope(c);
    return s ? { ...s, key: entityKey } : { key: entityKey };
  };
  // platform role sees all (including purged) via raw table
  const isPlatformScope = (c: Ctx) => c.get("userRole") === "platform";

  // LIST — platform sees everything via listLatest; others via current_* view
  app.openapi(routes.list, async (c) => {
    const query = c.req.valid("query");
    const limit = Math.min(Number(query.limit || 100), 200);
    const cursor = query.cursor ? decodeCursor(query.cursor) : undefined;
    const activeOnly = query.include_inactive !== "true";
    const rows = isPlatformScope(c)
      ? await listLatest<T>(tableName, resolveScope(c), { limit, cursor, activeOnly })
      : await listCurrent<T>(viewName, resolveScope(c), { limit, cursor, activeOnly });
    const nextCursor = rows.length === limit
      ? encodeCursor(rows[rows.length - 1])
      : null;
    const mapped = rows.map(mapRow);
    const colorMap = await fetchColorMap(entityType, rows.map((r) => r.key));
    attachColors(mapped, colorMap);
    return c.json({ data: mapped, next_cursor: nextCursor }, 200);
  });

  // GET — platform sees via raw table; others via current_* view
  app.openapi(routes.get, async (c) => {
    const entityKey = getKey(c);
    const row = isPlatformScope(c)
      ? await getLatest<T>(tableName, entityKey)
      : await getCurrent<T>(viewName, getFilter(c, entityKey));
    if (!row) return c.json({ error: "Not found" }, 404);
    const mapped = mapRow(row);
    const colorMap = await fetchColorMap(entityType, [row.key]);
    mapped.color_hex = colorMap.get(row.key) ?? null;
    return c.json({ data: mapped }, 200);
  });

  // CREATE
  app.use(routes.create.getRoutingPath(), createGuard);
  app.openapi(routes.create, async (c) => {
    const body = c.req.valid("json") as Record<string, unknown>;
    const hashes = computeMasterHashes(hashCreate(body), null);
    const [created] = await db.insert(table).values({ ...buildCreate(body, c), ...hashes }).returning();
    recordAudit(c, { action: "create", entityType, entityKey: created.key });
    const name = (body.name as string) ?? (body.code as string) ?? "";
    recordEvent(c, {
      action: "create", entityType, entityKey: created.key,
      entityName: name,
      summary: `${entityLabel}「${name}」を作成しました`,
    });
    const mappedCreated = mapRow(created as unknown as T);
    mappedCreated.color_hex = null;
    return c.json({ data: mappedCreated }, 201);
  });

  // Authority check helper
  const checkAuthorityGuard = async (c: Ctx, current: T) => {
    if (!hasAuthority) return null;
    const ark = (current as T & { authority_role_key?: number }).authority_role_key;
    if (ark == null) return null;
    const err = await authorityCheck(c.get("roleKey"), ark, entityLabel);
    if (err) return c.json({ error: err }, 403);
    return null;
  };

  // UPDATE
  app.use(routes.update.getRoutingPath(), updateGuard);
  app.openapi(routes.update, async (c) => {
    const entityKey = getKey(c);
    const body = c.req.valid("json") as Record<string, unknown>;
    const current = await getCurrent<T>(viewName, getFilter(c, entityKey));
    if (!current) return c.json({ error: "Not found" }, 404);
    const authDenied = await checkAuthorityGuard(c, current);
    if (authDenied) return authDenied;
    const maxRev = await getMaxRevision(tableName, entityKey);
    const hashes = computeMasterHashes(hashUpdate(body, current), (current as BaseRow).revision_hash);
    const [updated] = await db.insert(table).values({
      key: entityKey, revision: maxRev + 1, ...buildUpdate(body, current, c), ...hashes,
    }).returning();
    recordAudit(c, { action: "update", entityType, entityKey, revision: maxRev + 1 });
    const currentName = (current as T & { name?: string }).name ?? "";
    const changes = computeChanges(mapRow(current), body);
    recordEvent(c, {
      action: "update", entityType, entityKey,
      entityName: currentName,
      summary: `${entityLabel}「${currentName}」を更新しました`,
      changes: changes.length > 0 ? changes : undefined,
    });
    const mappedUpdated = mapRow(updated as unknown as T);
    const updColorMap = await fetchColorMap(entityType, [entityKey]);
    mappedUpdated.color_hex = updColorMap.get(entityKey) ?? null;
    return c.json({ data: mappedUpdated }, 200);
  });

  // DELETE (deactivate) — same reference check as purge
  app.use(routes.del.getRoutingPath(), deleteGuard);
  app.openapi(routes.del, async (c) => {
    const entityKey = getKey(c);
    const current = await getCurrent<T>(viewName, getFilter(c, entityKey));
    if (!current) return c.json({ error: "Not found" }, 404);
    const deactAuthDenied = await checkAuthorityGuard(c, current);
    if (deactAuthDenied) return deactAuthDenied;
    if ((current as T & { is_active?: boolean }).is_active === false) {
      return c.json({ error: "Already deactivated" }, 422);
    }
    if (canPurge) {
      const reason = await canPurge(entityKey);
      if (reason) return c.json({ error: reason }, 422);
    }
    const maxRev = await getMaxRevision(tableName, entityKey);
    const hashes = computeMasterHashes(hashDeactivate(current), (current as BaseRow).revision_hash);
    await db.insert(table).values({
      key: entityKey, revision: maxRev + 1, ...buildDeactivate(current, c), is_active: false, ...hashes,
    });
    recordAudit(c, { action: "deactivate", entityType, entityKey, revision: maxRev + 1 });
    const currentName = (current as T & { name?: string }).name ?? "";
    recordEvent(c, {
      action: "deactivate", entityType, entityKey,
      entityName: currentName,
      summary: `${entityLabel}「${currentName}」を無効化しました`,
    });
    return c.json({ message: "Deactivated" }, 200);
  });

  // HISTORY
  app.openapi(routes.history, async (c) => {
    const rows = await listHistory<T>(historyView, getKey(c));
    return c.json({ data: rows.map(mapRow) }, 200);
  });

  // RESTORE — reactivate a deactivated entity
  app.use(routes.restore.getRoutingPath(), restoreGuard);
  app.openapi(routes.restore, async (c) => {
    const entityKey = getKey(c);
    const current = await getLatest<T>(tableName, entityKey);
    if (!current) return c.json({ error: "Not found" }, 404);
    const restoreAuthDenied = await checkAuthorityGuard(c, current);
    if (restoreAuthDenied) return restoreAuthDenied;
    if ((current as T & { is_active?: boolean }).is_active !== false) {
      return c.json({ error: "Already active" }, 422);
    }
    if ((current as T & { valid_to?: string | null }).valid_to != null) {
      return c.json({ error: "Purged entities cannot be restored" }, 422);
    }
    const maxRev = await getMaxRevision(tableName, entityKey);
    const hashes = computeMasterHashes(hashDeactivate(current), (current as BaseRow).revision_hash);
    const [restored] = await db.insert(table).values({
      key: entityKey, revision: maxRev + 1, ...buildDeactivate(current, c), is_active: true, ...hashes,
    }).returning();
    recordAudit(c, { action: "restore", entityType, entityKey, revision: maxRev + 1 });
    const currentName = (current as T & { name?: string }).name ?? "";
    recordEvent(c, {
      action: "restore", entityType, entityKey,
      entityName: currentName,
      summary: `${entityLabel}「${currentName}」を復元しました`,
    });
    const mapped = mapRow(restored as unknown as T);
    const restoredColorMap = await fetchColorMap(entityType, [entityKey]);
    mapped.color_hex = restoredColorMap.get(entityKey) ?? null;
    return c.json({ data: mapped }, 200);
  });

  // PURGE — insert revision with valid_to=now() to hide from current_* views
  app.use(routes.purge.getRoutingPath(), purgeGuard);
  app.openapi(routes.purge, async (c) => {
    if (!canPurge) {
      return c.json({ error: "Purge not supported for this entity" }, 403);
    }
    const entityKey = getKey(c);
    // Use getLatest (raw table) so we can see already-deactivated items
    const current = await getLatest<T>(tableName, entityKey);
    if (!current) return c.json({ error: "Not found" }, 404);
    const purgeAuthDenied = await checkAuthorityGuard(c, current);
    if (purgeAuthDenied) return purgeAuthDenied;
    if ((current as T & { is_active?: boolean }).is_active !== false) {
      return c.json({ error: "Must be deactivated before purge" }, 422);
    }
    // Check if already purged (valid_to is set)
    if ((current as T & { valid_to?: string | null }).valid_to != null) {
      return c.json({ error: "Already purged" }, 422);
    }
    const reason = await canPurge(entityKey);
    if (reason) {
      return c.json({ error: reason }, 422);
    }
    const maxRev = await getMaxRevision(tableName, entityKey);
    const hashes = computeMasterHashes(hashDeactivate(current), (current as BaseRow).revision_hash);
    await db.insert(table).values({
      key: entityKey, revision: maxRev + 1, ...buildDeactivate(current, c),
      is_active: false, valid_to: new Date(), ...hashes,
    });
    recordAudit(c, { action: "purge", entityType, entityKey, revision: maxRev + 1 });
    const currentName = (current as T & { name?: string }).name ?? "";
    recordEvent(c, {
      action: "purge", entityType, entityKey,
      entityName: currentName,
      summary: `${entityLabel}「${currentName}」を完全削除しました`,
    });
    return c.json({ message: "Purged" }, 200);
  });
}
