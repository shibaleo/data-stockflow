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
 * List latest revision per key from raw table (ignores valid_to).
 * Used by tenant/platform scope to include purged entities.
 */
export async function listLatest<T>(
  tableName: string,
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

  let scopeClause = sql``;
  if (scopeFilter) {
    if ("tenant_key" in scopeFilter) {
      scopeClause = sql`AND tenant_key = ${scopeFilter.tenant_key}`;
    } else {
      scopeClause = sql`AND book_key = ${scopeFilter.book_key}`;
    }
  }

  const { rows } = await db.execute(sql`
    SELECT DISTINCT ON (key) *
    FROM ${sql.raw(`"${S}"."${tableName}"`)}
    WHERE 1=1 ${scopeClause} ${cursorClause}
    ORDER BY key, created_at DESC
  `);
  // Post-filter: activeOnly and limit (DISTINCT ON requires specific ORDER BY)
  let filtered = rows as T[];
  if (options.activeOnly) {
    filtered = filtered.filter((r) => (r as T & { is_active: boolean }).is_active);
  }
  // Re-sort by key DESC and apply limit
  filtered.sort((a, b) => ((b as T & { key: number }).key) - ((a as T & { key: number }).key));
  return filtered.slice(0, limit);
}

/**
 * Get latest revision for a single entity from raw table (ignores valid_to).
 */
export async function getLatest<T>(
  tableName: string,
  entityKey: number
): Promise<T | null> {
  const { rows } = await db.execute(sql`
    SELECT * FROM ${sql.raw(`"${S}"."${tableName}"`)}
    WHERE key = ${entityKey}
    ORDER BY created_at DESC
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

// ── Table name → display label (for purge error messages) ──

const TABLE_LABELS: Record<string, string> = {
  journal_line: "仕訳明細",
  journal: "仕訳",
  project: "プロジェクト",
  account: "勘定科目",
  display_account: "表示科目",
  department: "部門",
  counterparty: "取引先",
  category: "分類",
  entity_category: "エンティティ分類",
  voucher: "伝票",
  book: "帳簿",
};

/**
 * Check if any table in data_stockflow references the given entity key
 * via a column named `{columnName}`.
 *
 * Uses information_schema to dynamically find all referencing tables,
 * so new references are automatically picked up without code changes.
 *
 * @param columnName - e.g. "department_key", "account_key"
 * @param entityKey - the key value to check
 * @param excludeTables - tables to skip (e.g. the entity's own table)
 */
export async function checkReferences(
  columnName: string,
  entityKey: number,
  excludeTables: string[] = [],
): Promise<string | null> {
  // Find all tables in data_stockflow that have this column
  const { rows: cols } = await db.execute(sql`
    SELECT table_name FROM information_schema.columns
    WHERE table_schema = ${S} AND column_name = ${columnName}
    ORDER BY table_name
  `);

  const excludeSet = new Set(excludeTables);
  for (const col of cols as { table_name: string }[]) {
    const table = col.table_name;
    if (excludeSet.has(table)) continue;
    const { rows } = await db.execute(sql`
      SELECT 1 FROM ${sql.raw(`"${S}"."${table}"`)}
      WHERE ${sql.raw(`"${columnName}"`)} = ${entityKey}
      LIMIT 1
    `);
    if (rows.length > 0) {
      const label = TABLE_LABELS[table] ?? table;
      return `${label}が参照しているため完全削除できません`;
    }
  }
  return null;
}
