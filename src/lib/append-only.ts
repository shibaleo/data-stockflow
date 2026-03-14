import { db } from "@/lib/db";
import { sql } from "drizzle-orm";

const S = "data_stockflow";

/**
 * List current (latest active revision) records from a current_* view.
 * Cursor-based pagination using (created_at, key).
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
    cursor?: { created_at: string; key: number };
    activeOnly?: boolean;
  } = {}
): Promise<T[]> {
  const limit = Math.min(options.limit ?? 50, 200);
  const activeClause = options.activeOnly ? sql`AND is_active = true` : sql``;

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

  if (filterCol && filterVal != null && options.cursor) {
    const { rows } = await db.execute(sql`
      SELECT * FROM ${sql.raw(`"${S}"."${viewName}"`)}
      WHERE ${sql.raw(`"${filterCol}"`)} = ${filterVal}
        ${activeClause}
        AND (created_at, key) < (${options.cursor.created_at}::timestamptz, ${options.cursor.key})
      ORDER BY created_at DESC, key DESC
      LIMIT ${limit}
    `);
    return rows as T[];
  }

  if (filterCol && filterVal != null) {
    const { rows } = await db.execute(sql`
      SELECT * FROM ${sql.raw(`"${S}"."${viewName}"`)}
      WHERE ${sql.raw(`"${filterCol}"`)} = ${filterVal}
        ${activeClause}
      ORDER BY created_at DESC, key DESC
      LIMIT ${limit}
    `);
    return rows as T[];
  }

  // No filter (e.g. role)
  if (options.cursor) {
    const { rows } = await db.execute(sql`
      SELECT * FROM ${sql.raw(`"${S}"."${viewName}"`)}
      WHERE 1=1 ${activeClause}
        AND (created_at, key) < (${options.cursor.created_at}::timestamptz, ${options.cursor.key})
      ORDER BY created_at DESC, key DESC
      LIMIT ${limit}
    `);
    return rows as T[];
  }

  const { rows } = await db.execute(sql`
    SELECT * FROM ${sql.raw(`"${S}"."${viewName}"`)}
    WHERE 1=1 ${activeClause}
    ORDER BY created_at DESC, key DESC
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

/**
 * Decode a cursor string (base64 JSON).
 */
export function decodeCursor(
  cursor: string
): { created_at: string; key: number } | undefined {
  try {
    const decoded = JSON.parse(Buffer.from(cursor, "base64url").toString());
    if (decoded.created_at && decoded.key != null) return decoded;
  } catch {
    // invalid cursor
  }
  return undefined;
}

/**
 * Encode a cursor from a row with created_at and key.
 */
export function encodeCursor(row: {
  created_at: Date | string;
  key: number;
}): string {
  const ts =
    row.created_at instanceof Date
      ? row.created_at.toISOString()
      : row.created_at;
  return Buffer.from(
    JSON.stringify({ created_at: ts, key: row.key })
  ).toString("base64url");
}
