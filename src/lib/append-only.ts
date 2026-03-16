import { db } from "@/lib/db";
import { sql } from "drizzle-orm";

const S = "data_stockflow";

/**
 * List current (latest active revision) records from a current_* view.
 * Cursor-based pagination using key (monotonically increasing).
 *
 * scopeFilter can be:
 * - { tenant_key: number } for tenant-scoped views
 * - { book_key: number } for book-scoped views
 * - null for global views (e.g. role)
 */
export async function listCurrent<T>(
  viewName: string,
  scopeFilter: { tenant_key: number } | { book_key: number } | null,
  options: {
    limit?: number;
    cursor?: number;
    activeOnly?: boolean;
  } = {}
): Promise<T[]> {
  const limit = Math.min(options.limit ?? 100, 200);
  const activeClause = options.activeOnly ? sql`AND is_active = true` : sql``;
  const cursorClause = options.cursor ? sql`AND key < ${options.cursor}` : sql``;

  let filterCol: string | null = null;
  let filterVal: number | null = null;
  if (scopeFilter) {
    if ("tenant_key" in scopeFilter) {
      filterCol = "tenant_key";
      filterVal = scopeFilter.tenant_key;
    } else {
      filterCol = "book_key";
      filterVal = scopeFilter.book_key;
    }
  }

  if (filterCol && filterVal != null) {
    const { rows } = await db.execute(sql`
      SELECT * FROM ${sql.raw(`"${S}"."${viewName}"`)}
      WHERE ${sql.raw(`"${filterCol}"`)} = ${filterVal}
        ${activeClause} ${cursorClause}
      ORDER BY key DESC
      LIMIT ${limit}
    `);
    return rows as T[];
  }

  const { rows } = await db.execute(sql`
    SELECT * FROM ${sql.raw(`"${S}"."${viewName}"`)}
    WHERE 1=1 ${activeClause} ${cursorClause}
    ORDER BY key DESC
    LIMIT ${limit}
  `);
  return rows as T[];
}

/**
 * Get a single current record by key columns.
 */
export async function getCurrent<T>(
  viewName: string,
  keyFilter: Record<string, unknown>
): Promise<T | null> {
  const keys = Object.keys(keyFilter);
  const whereParts = keys.map((k) => {
    const val = keyFilter[k];
    return sql`${sql.raw(`"${k}"`)} = ${val}`;
  });
  const whereClause = whereParts.reduce(
    (acc, part) => sql`${acc} AND ${part}`
  );

  const { rows } = await db.execute(sql`
    SELECT * FROM ${sql.raw(`"${S}"."${viewName}"`)}
    WHERE ${whereClause}
    LIMIT 1
  `);
  return (rows[0] as T) ?? null;
}

/**
 * Get the maximum revision number for a given entity key.
 */
export async function getMaxRevision(
  tableName: string,
  entityKey: number
): Promise<number> {
  const { rows } = await db.execute(sql`
    SELECT COALESCE(MAX(revision), 0) as max_rev
    FROM ${sql.raw(`"${S}"."${tableName}"`)}
    WHERE key = ${entityKey}
  `);
  return Number((rows[0] as { max_rev: bigint | null })?.max_rev ?? 0);
}

/**
 * List all revisions for an entity (history view).
 */
export async function listHistory<T>(
  viewName: string,
  entityKey: number
): Promise<T[]> {
  const { rows } = await db.execute(sql`
    SELECT * FROM ${sql.raw(`"${S}"."${viewName}"`)}
    WHERE key = ${entityKey}
    ORDER BY revision ASC
  `);
  return rows as T[];
}

/** Decode cursor string → key number. */
export function decodeCursor(cursor: string): number | undefined {
  const n = Number(cursor);
  return Number.isFinite(n) ? n : undefined;
}

/** Encode cursor from a row's key. */
export function encodeCursor(row: { key: number }): string {
  return String(row.key);
}
