import * as jose from "jose";
import { db } from "@/lib/db";
import { apiKey } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import type { AuthResult } from "@/lib/auth";
import type { UserRole } from "@/middleware/context";

const PREFIX = "sf_";
const ROLES: readonly string[] = ["platform", "audit", "admin", "user"];

function getSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET is not set");
  return new TextEncoder().encode(secret);
}

/**
 * Create a new API key (JWT-based).
 * Format: sf_<HS256 JWT>
 * JWT contains: sub (userKey), tenant_key, role, jti (for revocation lookup).
 */
export async function createApiKey(opts: {
  userKey: number;
  tenantKey: number;
  role: UserRole;
  name: string;
  expiresAt?: Date | null;
}) {
  const jti = crypto.randomUUID();

  const builder = new jose.SignJWT({
    tenant_key: opts.tenantKey,
    role: opts.role,
    jti,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(String(opts.userKey))
    .setIssuedAt();

  if (opts.expiresAt) {
    builder.setExpirationTime(Math.floor(opts.expiresAt.getTime() / 1000));
  }

  const jwt = await builder.sign(getSecret());
  const rawKey = `${PREFIX}${jwt}`;
  const keyPrefix = rawKey.slice(0, PREFIX.length + 8);

  const [record] = await db
    .insert(apiKey)
    .values({
      user_key: opts.userKey,
      tenant_key: opts.tenantKey,
      name: opts.name,
      key_prefix: keyPrefix,
      key_hash: jti, // reuse column as jti storage
      role: opts.role,
      expires_at: opts.expiresAt ?? null,
    })
    .returning();

  return { rawKey, record };
}

/**
 * Verify an API key (sf_ + JWT).
 * 1. Verify JWT signature + expiration
 * 2. Check jti exists in DB (not revoked)
 * 3. Update last_used_at
 */
export async function verifyApiKey(
  rawKey: string
): Promise<AuthResult | null> {
  if (!rawKey.startsWith(PREFIX)) return null;

  const jwt = rawKey.slice(PREFIX.length);

  let payload: jose.JWTPayload;
  try {
    const result = await jose.jwtVerify(jwt, getSecret(), {
      algorithms: ["HS256"],
    });
    payload = result.payload;
  } catch {
    return null;
  }

  const userKey = Number(payload.sub);
  const tenantKey = Number(payload.tenant_key);
  const role = payload.role as string;
  const jti = payload.jti;
  if (!userKey || !tenantKey || !role || !jti) return null;
  if (!ROLES.includes(role)) return null;

  // Check not revoked (jti stored in key_hash column)
  const rows = await db
    .select({ uuid: apiKey.uuid })
    .from(apiKey)
    .where(eq(apiKey.key_hash, jti));

  if (rows.length === 0) return null;

  // Update last_used_at (fire-and-forget)
  db.update(apiKey)
    .set({ last_used_at: new Date() })
    .where(eq(apiKey.key_hash, jti))
    .then(() => {})
    .catch(() => {});

  return {
    userKey,
    tenantKey,
    role: role as UserRole,
    roleCode: role,
  };
}

/**
 * List API keys for a user.
 */
export async function listApiKeys(userKey: number) {
  return db
    .select({
      uuid: apiKey.uuid,
      name: apiKey.name,
      key_prefix: apiKey.key_prefix,
      role: apiKey.role,
      expires_at: apiKey.expires_at,
      last_used_at: apiKey.last_used_at,
      created_at: apiKey.created_at,
    })
    .from(apiKey)
    .where(eq(apiKey.user_key, userKey))
    .orderBy(apiKey.created_at);
}

/**
 * Revoke (physically delete) an API key.
 */
export async function revokeApiKey(uuid: string, userKey: number) {
  const result = await db
    .delete(apiKey)
    .where(and(eq(apiKey.uuid, uuid), eq(apiKey.user_key, userKey)))
    .returning({ uuid: apiKey.uuid });
  return result.length > 0;
}
