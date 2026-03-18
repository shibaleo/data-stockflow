/**
 * Authority helper — role-rank-based entity editing control.
 *
 * Each entity stores the creator's role_key as authority_role_key.
 * On update/deactivate/purge, we compare the user's roleRank against
 * the entity's authority_role_key's rank. Higher rank = more authority.
 */
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";

const S = "data_stockflow";

/** In-memory cache: role_key → authority_rank */
const rankCache = new Map<number, number>();

export async function getRoleRank(roleKey: number): Promise<number> {
  const cached = rankCache.get(roleKey);
  if (cached !== undefined) return cached;

  const { rows } = await db.execute(sql`
    SELECT authority_rank FROM ${sql.raw(`"${S}".current_role`)}
    WHERE key = ${roleKey} LIMIT 1
  `);
  const rank = rows.length > 0
    ? (rows[0] as { authority_rank: number }).authority_rank
    : 0;
  rankCache.set(roleKey, rank);
  return rank;
}

/**
 * Check if a user with `userRank` can modify an entity
 * that was created by a role with `entityAuthorityRoleKey`.
 *
 * Returns true if userRank >= entity's role rank.
 */
/**
 * Check if a user with `userRank` can modify an entity
 * that was created by a role with `entityAuthorityRoleKey`.
 *
 * Returns true if userRank >= entity's role rank.
 */
export async function canModify(
  userRank: number,
  entityAuthorityRoleKey: number,
): Promise<boolean> {
  const entityRank = await getRoleRank(entityAuthorityRoleKey);
  return userRank >= entityRank;
}

/**
 * Check authority and return an error message if denied.
 * Returns null if the user is allowed.
 */
export async function authorityCheck(
  userRank: number,
  entityAuthorityRoleKey: number,
  entityLabel: string,
): Promise<string | null> {
  const ok = await canModify(userRank, entityAuthorityRoleKey);
  return ok ? null : `権限不足：この${entityLabel}を変更する権限がありません`;
}
