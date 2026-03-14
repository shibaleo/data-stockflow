import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

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
  } = {}
): Promise<T[]> {
  const limit = Math.min(options.limit ?? 50, 200);

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
    return prisma.$queryRawUnsafe<T[]>(
      `SELECT * FROM "${S}"."${viewName}"
       WHERE "${filterCol}" = $1
         AND (created_at, id) < ($2::timestamptz, $3::uuid)
       ORDER BY created_at DESC, id DESC
       LIMIT $4`,
      filterVal,
      options.cursor.created_at,
      options.cursor.id,
      limit
    );
  }

  if (filterCol && filterVal) {
    return prisma.$queryRawUnsafe<T[]>(
      `SELECT * FROM "${S}"."${viewName}"
       WHERE "${filterCol}" = $1
       ORDER BY created_at DESC, id DESC
       LIMIT $2`,
      filterVal,
      limit
    );
  }

  // No filter (e.g. tax_class)
  if (options.cursor) {
    return prisma.$queryRawUnsafe<T[]>(
      `SELECT * FROM "${S}"."${viewName}"
       WHERE (created_at, id) < ($1::timestamptz, $2::uuid)
       ORDER BY created_at DESC, id DESC
       LIMIT $3`,
      options.cursor.created_at,
      options.cursor.id,
      limit
    );
  }

  return prisma.$queryRawUnsafe<T[]>(
    `SELECT * FROM "${S}"."${viewName}"
     ORDER BY created_at DESC, id DESC
     LIMIT $1`,
    limit
  );
}

/**
 * Get a single current record by identity key columns.
 */
export async function getCurrent<T>(
  viewName: string,
  keyFilter: Record<string, unknown>
): Promise<T | null> {
  const keys = Object.keys(keyFilter);
  const where = keys.map((k, i) => `"${k}" = $${i + 1}`).join(" AND ");
  const values = keys.map((k) => keyFilter[k]);

  const rows = await prisma.$queryRawUnsafe<T[]>(
    `SELECT * FROM "${S}"."${viewName}" WHERE ${where} LIMIT 1`,
    ...values
  );
  return rows[0] ?? null;
}

/**
 * Get the maximum revision number for a given identity key set.
 */
export async function getMaxRevision(
  tableName: string,
  keyFilter: Record<string, unknown>
): Promise<number> {
  const keys = Object.keys(keyFilter);
  const where = keys.map((k, i) => `"${k}" = $${i + 1}`).join(" AND ");
  const values = keys.map((k) => keyFilter[k]);

  const rows = await prisma.$queryRawUnsafe<{ max_rev: bigint | null }[]>(
    `SELECT COALESCE(MAX(revision), 0) as max_rev
     FROM "${S}"."${tableName}" WHERE ${where}`,
    ...values
  );
  return Number(rows[0]?.max_rev ?? 0);
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
export function encodeCursor(row: { created_at: Date; id: string }): string {
  return Buffer.from(
    JSON.stringify({ created_at: row.created_at.toISOString(), id: row.id })
  ).toString("base64url");
}
