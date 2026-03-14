import { db } from "@/lib/db";
import { sql } from "drizzle-orm";

const S = "data_stockflow";

/**
 * List current (latest active revision) records from a current_* view.
 * Cursor-based pagination using (created_at, id).
 *
 * scopeFilter can be:
 * - { tenant_id: string } for tenant-scoped views
 * - { book_code: string } for book-scoped views
 * - null for global views (e.g. tax_class)
 */
export async function listCurrent<T>(
  viewName: string,
  scopeFilter: { tenant_id: string } | { book_code: string } | null,
  options: {
    limit?: number;
    cursor?: { created_at: string; id: string };
    activeOnly?: boolean;
  } = {}
): Promise<T[]> {
  const limit = Math.min(options.limit ?? 50, 200);
  const activeClause = options.activeOnly ? sql`AND is_active = true` : sql``;

  // Determine filter column and value
  let filterCol: string | null = null;
  let filterVal: string | null = null;
  if (scopeFilter) {
    if ("tenant_id" in scopeFilter) {
      filterCol = "tenant_id";
      filterVal = scopeFilter.tenant_id;
    } else {
      filterCol = "book_code";
      filterVal = scopeFilter.book_code;
    }
  }

  if (filterCol && filterVal && options.cursor) {
    const { rows } = await db.execute(sql`
      SELECT * FROM "data_stockflow".${sql.raw(`"${viewName}"`)}
      WHERE ${sql.raw(`"${filterCol}"`)} = ${filterVal}
        ${activeClause}
        AND (created_at, id) < (${options.cursor.created_at}::timestamptz, ${options.cursor.id}::uuid)
      ORDER BY created_at DESC, id DESC
      LIMIT ${limit}
    `);
    return rows as T[];
  }

  if (filterCol && filterVal) {
    const { rows } = await db.execute(sql`
      SELECT * FROM "data_stockflow".${sql.raw(`"${viewName}"`)}
      WHERE ${sql.raw(`"${filterCol}"`)} = ${filterVal}
        ${activeClause}
      ORDER BY created_at DESC, id DESC
      LIMIT ${limit}
    `);
    return rows as T[];
  }

  // No filter (e.g. tax_class)
  if (options.cursor) {
    const { rows } = await db.execute(sql`
      SELECT * FROM "data_stockflow".${sql.raw(`"${viewName}"`)}
      WHERE 1=1 ${activeClause}
        AND (created_at, id) < (${options.cursor.created_at}::timestamptz, ${options.cursor.id}::uuid)
      ORDER BY created_at DESC, id DESC
      LIMIT ${limit}
    `);
    return rows as T[];
  }

  const { rows } = await db.execute(sql`
    SELECT * FROM "data_stockflow".${sql.raw(`"${viewName}"`)}
    WHERE 1=1 ${activeClause}
    ORDER BY created_at DESC, id DESC
    LIMIT ${limit}
  `);
  return rows as T[];
}

/**
 * Get a single current record by identity key columns.
 */
export async function getCurrent<T>(
  viewName: string,
  keyFilter: Record<string, unknown>
): Promise<T | null> {
  const keys = Object.keys(keyFilter);
  const whereParts = keys.map((k, i) => {
    const val = keyFilter[k];
    return sql`${sql.raw(`"${k}"`)} = ${val}`;
  });
  const whereClause = whereParts.reduce((acc, part) => sql`${acc} AND ${part}`);

  const { rows } = await db.execute(sql`
    SELECT * FROM "data_stockflow".${sql.raw(`"${viewName}"`)}
    WHERE ${whereClause}
    LIMIT 1
  `);
  return (rows[0] as T) ?? null;
}

/**
 * Get the maximum revision number for a given identity key set.
 */
export async function getMaxRevision(
  tableName: string,
  keyFilter: Record<string, unknown>
): Promise<number> {
  const keys = Object.keys(keyFilter);
  const whereParts = keys.map((k) => {
    const val = keyFilter[k];
    return sql`${sql.raw(`"${k}"`)} = ${val}`;
  });
  const whereClause = whereParts.reduce((acc, part) => sql`${acc} AND ${part}`);

  const { rows } = await db.execute(sql`
    SELECT COALESCE(MAX(revision), 0) as max_rev
    FROM "data_stockflow".${sql.raw(`"${tableName}"`)}
    WHERE ${whereClause}
  `);
  return Number((rows[0] as { max_rev: bigint | null })?.max_rev ?? 0);
}

/**
 * Decode a cursor string (base64 JSON).
 */
export function decodeCursor(
  cursor: string
): { created_at: string; id: string } | undefined {
  try {
    const decoded = JSON.parse(Buffer.from(cursor, "base64url").toString());
    if (decoded.created_at && decoded.id) return decoded;
  } catch {
    // invalid cursor
  }
  return undefined;
}

/**
 * Encode a cursor from a row with created_at and id.
 */
export function encodeCursor(row: { created_at: Date | string; id: string }): string {
  const ts =
    row.created_at instanceof Date
      ? row.created_at.toISOString()
      : row.created_at;
  return Buffer.from(
    JSON.stringify({ created_at: ts, id: row.id })
  ).toString("base64url");
}
