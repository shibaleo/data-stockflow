import * as jose from "jose";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";
import type { UserRole } from "@/middleware/context";

const S = "data_stockflow";

export interface AuthResult {
  userKey: number;
  tenantKey: number;
  role: UserRole;
  roleCode: string;
}

const ROLES: readonly string[] = [
  "platform",
  "audit",
  "admin",
  "user",
];

// ============================================================
// Clerk JWKS — verify JWT and extract sub (Clerk user ID)
// ============================================================

function getClerkDomain(): string | null {
  const pk = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  if (!pk) return null;
  const encoded = pk.replace(/^pk_(test|live)_/, "");
  try {
    const decoded = atob(encoded);
    return decoded.replace(/\$$/, "");
  } catch {
    return null;
  }
}

let clerkJWKS: ReturnType<typeof jose.createRemoteJWKSet> | null = null;

function getClerkJWKS(): ReturnType<typeof jose.createRemoteJWKSet> | null {
  if (clerkJWKS) return clerkJWKS;
  const domain = getClerkDomain();
  if (!domain) return null;
  clerkJWKS = jose.createRemoteJWKSet(
    new URL(`https://${domain}/.well-known/jwks.json`)
  );
  return clerkJWKS;
}

async function verifyClerkToken(token: string): Promise<string | null> {
  const jwks = getClerkJWKS();
  if (!jwks) return null;
  try {
    const { payload } = await jose.jwtVerify(token, jwks);
    return (payload.sub as string) || null;
  } catch {
    return null;
  }
}

/**
 * Look up user by external_id from current_user view + current_role.
 * Auto-creates on first login using DEFAULT_TENANT_KEY.
 */
async function findOrCreateUser(
  externalId: string
): Promise<AuthResult | null> {
  // Try existing user
  const { rows: existing } = await db.execute(sql`
    SELECT u.key, u.tenant_key, u.role_key, r.code as role_code
    FROM ${sql.raw(`"${S}".current_user`)} u
    JOIN ${sql.raw(`"${S}".current_role`)} r ON r.key = u.role_key
    WHERE u.external_id = ${externalId}
    LIMIT 1
  `);

  if (existing.length > 0) {
    const row = existing[0] as {
      key: number;
      tenant_key: number;
      role_key: number;
      role_code: string;
    };
    if (!ROLES.includes(row.role_code)) return null;
    return {
      userKey: row.key,
      tenantKey: row.tenant_key,
      role: row.role_code as UserRole,
      roleCode: row.role_code,
    };
  }

  // Auto-create on first login
  const defaultTenantKey = Number(process.env.DEFAULT_TENANT_KEY || "100000000000");
  // Default role = 'user' (looked up from DB, fallback to bootstrap key)
  const { rows: roleRows } = await db.execute(sql`
    SELECT key FROM ${sql.raw(`"${S}".current_role`)}
    WHERE code = 'user'
    LIMIT 1
  `);
  const userRoleKey = roleRows.length > 0
    ? (roleRows[0] as { key: number }).key
    : 100000000003;

  const { rows: created } = await db.execute(sql`
    INSERT INTO ${sql.raw(`"${S}"."user"`)} (
      key, revision, external_id, tenant_key, role_key,
      lines_hash, prev_revision_hash, revision_hash
    ) VALUES (
      nextval('${sql.raw(`${S}.user_key_seq`)}'), 1, ${externalId},
      ${defaultTenantKey}, ${userRoleKey},
      'bootstrap', 'genesis', 'bootstrap'
    )
    RETURNING key, tenant_key, role_key
  `);

  if (created.length === 0) return null;
  const row = created[0] as {
    key: number;
    tenant_key: number;
    role_key: number;
  };
  return {
    userKey: row.key,
    tenantKey: row.tenant_key,
    role: "user",
    roleCode: "user",
  };
}

// ============================================================
// Dev HS256 token (fallback for curl/API testing)
// ============================================================

function getSecret(): Uint8Array | null {
  const secret = process.env.JWT_SECRET;
  if (!secret) return null;
  return new TextEncoder().encode(secret);
}

async function verifyDevToken(token: string): Promise<AuthResult | null> {
  const secret = getSecret();
  if (!secret) return null;
  try {
    const { payload } = await jose.jwtVerify(token, secret, {
      algorithms: ["HS256"],
    });
    const userKey = Number(payload.sub);
    const tenantKey = Number(payload.tenant_key);
    const roleCode = payload.role as string | undefined;
    if (!userKey || !tenantKey || !roleCode) return null;
    if (!ROLES.includes(roleCode)) return null;
    return {
      userKey,
      tenantKey,
      role: roleCode as UserRole,
      roleCode,
    };
  } catch {
    return null;
  }
}

// ============================================================
// Token extraction helpers
// ============================================================

function extractBearerToken(req: Request): string | null {
  const header =
    req.headers.get("authorization") || req.headers.get("Authorization");
  if (!header?.startsWith("Bearer ")) return null;
  return header.slice(7);
}

function extractSessionCookie(req: Request): string | null {
  const cookieHeader = req.headers.get("cookie");
  if (!cookieHeader) return null;
  const match = cookieHeader.match(/(?:^|;\s*)__session=([^;]*)/);
  return match ? match[1] : null;
}

// ============================================================
// Main authenticate function
// ============================================================

export async function authenticate(
  req: Request
): Promise<AuthResult | null> {
  const bearerToken = extractBearerToken(req);
  const cookieToken = extractSessionCookie(req);

  for (const token of [bearerToken, cookieToken]) {
    if (!token) continue;

    // Try Clerk JWKS → DB lookup
    const clerkUserId = await verifyClerkToken(token);
    if (clerkUserId) {
      return findOrCreateUser(clerkUserId);
    }

    // Fallback: dev HS256 token
    const devResult = await verifyDevToken(token);
    if (devResult) return devResult;
  }

  return null;
}

/**
 * Sign a dev JWT token (for testing/curl usage).
 */
export async function signToken(
  userKey: number,
  tenantKey: number,
  role: UserRole
): Promise<string> {
  const secret = getSecret();
  if (!secret) throw new Error("JWT_SECRET is not set");
  return new jose.SignJWT({ tenant_key: tenantKey, role })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(String(userKey))
    .setIssuedAt()
    .setExpirationTime("24h")
    .sign(secret);
}
