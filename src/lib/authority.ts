/**
 * Authority helper — matrix-based entity editing control.
 *
 * Each entity stores the creator's role_key as authority_role_key.
 * On update/deactivate/purge, we resolve both the user's roleKey and the
 * entity's authority_role_key to role codes, then check canModifyByRole().
 */
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";
import { canModifyByRole } from "@/lib/permissions";
import type { UserRole } from "@/middleware/context";

const S = "data_stockflow";

/** In-memory cache: role_key → role code */
const codeCache = new Map<number, UserRole>();

export async function getRoleCode(roleKey: number): Promise<UserRole | null> {
  const cached = codeCache.get(roleKey);
  if (cached !== undefined) return cached;

  const { rows } = await db.execute(sql`
    SELECT code FROM ${sql.raw(`"${S}".current_role`)}
    WHERE key = ${roleKey} LIMIT 1
  `);
  if (rows.length === 0) return null;
  const code = (rows[0] as { code: string }).code as UserRole;
  codeCache.set(roleKey, code);
  return code;
}

/**
 * Check if a user with `userRoleKey` can modify an entity
 * whose authority_role_key is `entityAuthorityRoleKey`.
 *
 * Resolves both keys to role codes and uses the authority matrix.
 */
export async function canModify(
  userRoleKey: number,
  entityAuthorityRoleKey: number,
): Promise<boolean> {
  const userCode = await getRoleCode(userRoleKey);
  const entityCode = await getRoleCode(entityAuthorityRoleKey);
  if (!userCode || !entityCode) return false;
  return canModifyByRole(userCode, entityCode);
}

/**
 * Check authority and return an error message if denied.
 * Returns null if the user is allowed.
 */
export async function authorityCheck(
  userRoleKey: number,
  entityAuthorityRoleKey: number,
  entityLabel: string,
): Promise<string | null> {
  const ok = await canModify(userRoleKey, entityAuthorityRoleKey);
  return ok ? null : `権限不足：この${entityLabel}を変更する権限がありません`;
}
