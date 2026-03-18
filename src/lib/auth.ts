import * as jose from "jose";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";
import { verifyApiKey } from "@/lib/api-keys";
import type { UserRole } from "@/middleware/context";

const S = "data_stockflow";

export interface AuthResult {
  userKey: number;
  tenantKey: number;
  role: UserRole;
  roleCode: string;
  userName: string;
  roleKey: number;
  roleRank: number;
}

const ROLES: readonly string[] = [
  "platform",
  "admin",
  "user",
  "auditor",
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

interface ClerkIdentity {
  userId: string;
  email: string | null;
}

// ── In-memory caches (process-level, cleared on redeploy) ──

/** Clerk userId → email, TTL 10 min */
const emailCache = new Map<string, { email: string | null; expiresAt: number }>();
const EMAIL_CACHE_TTL = 10 * 60 * 1000;

/** AuthResult cache keyed by email, TTL 5 min */
const authCache = new Map<string, { result: AuthResult; expiresAt: number }>();
const AUTH_CACHE_TTL = 5 * 60 * 1000;

function getCachedEmail(userId: string): string | null | undefined {
  const entry = emailCache.get(userId);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) { emailCache.delete(userId); return undefined; }
  return entry.email;
}

function setCachedEmail(userId: string, email: string | null) {
  emailCache.set(userId, { email, expiresAt: Date.now() + EMAIL_CACHE_TTL });
}

function getCachedAuth(userId: string): AuthResult | undefined {
  const entry = authCache.get(userId);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) { authCache.delete(userId); return undefined; }
  return entry.result;
}

function setCachedAuth(userId: string, result: AuthResult) {
  authCache.set(userId, { result, expiresAt: Date.now() + AUTH_CACHE_TTL });
}

async function fetchClerkEmail(userId: string): Promise<string | null> {
  const cached = getCachedEmail(userId);
  if (cached !== undefined) return cached;

  const clerkSecretKey = process.env.CLERK_SECRET_KEY;
  if (!clerkSecretKey) return null;

  try {
    const res = await fetch(`https://api.clerk.com/v1/users/${userId}`, {
      headers: { Authorization: `Bearer ${clerkSecretKey}` },
    });
    if (res.ok) {
      const userData = await res.json() as {
        email_addresses?: Array<{ email_address: string; id: string }>;
        primary_email_address_id?: string;
      };
      const primary = userData.email_addresses?.find(
        (e) => e.id === userData.primary_email_address_id
      );
      const email = primary?.email_address ?? userData.email_addresses?.[0]?.email_address ?? null;
      setCachedEmail(userId, email);
      return email;
    }
  } catch {
    // Clerk API unreachable — continue without email
  }
  return null;
}

async function verifyClerkToken(token: string): Promise<ClerkIdentity | null> {
  const jwks = getClerkJWKS();
  if (!jwks) return null;
  try {
    const { payload } = await jose.jwtVerify(token, jwks);
    const userId = payload.sub as string;
    if (!userId) return null;

    const email = await fetchClerkEmail(userId);
    return { userId, email };
  } catch {
    return null;
  }
}

type UserRow = { key: number; tenant_key: number; role_key: number; role_code: string; authority_rank: number; name: string };

function toAuthResult(row: UserRow): AuthResult | null {
  if (!ROLES.includes(row.role_code)) return null;
  return {
    userKey: row.key,
    tenantKey: row.tenant_key,
    role: row.role_code as UserRole,
    roleCode: row.role_code,
    userName: row.name,
    roleKey: row.role_key,
    roleRank: row.authority_rank,
  };
}

/**
 * Look up user by email.
 * Clerk provides the email via Backend API; we match it against the user table.
 */
async function findUser(
  identity: ClerkIdentity
): Promise<AuthResult | null> {
  if (!identity.email) return null;
  const { rows } = await db.execute(sql`
    SELECT u.key, u.tenant_key, u.role_key, u.name, r.code as role_code, r.authority_rank
    FROM ${sql.raw(`"${S}".current_user`)} u
    JOIN ${sql.raw(`"${S}".current_role`)} r ON r.key = u.role_key
    WHERE u.email = ${identity.email}
    LIMIT 1
  `);
  if (rows.length === 0) return null;
  return toAuthResult(rows[0] as UserRow);
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
    const userName = (payload.name as string | undefined) ?? "dev";
    if (!userKey || !tenantKey || !roleCode) return null;
    if (!ROLES.includes(roleCode)) return null;

    // Lookup role key + rank from DB
    const { rows: roleRows } = await db.execute(sql`
      SELECT key, authority_rank FROM ${sql.raw(`"${S}".current_role`)}
      WHERE code = ${roleCode} LIMIT 1
    `);
    const roleRow = roleRows[0] as { key: number; authority_rank: number } | undefined;

    return {
      userKey,
      tenantKey,
      role: roleCode as UserRole,
      roleCode,
      userName,
      roleKey: roleRow?.key ?? 0,
      roleRank: roleRow?.authority_rank ?? 0,
    };
  } catch {
    return null;
  }
}

// ============================================================
// Token extraction helpers
// ============================================================

function extractBearerToken(req: Request): string | null {
  // X-Api-Key: set by proxy.ts when sf_ token is moved from Authorization
  const apiKey = req.headers.get("x-api-key");
  if (apiKey) return apiKey;

  const header =
    req.headers.get("authorization") || req.headers.get("Authorization");
  if (!header?.startsWith("Bearer ")) return null;
  return header.slice(7);
}

function extractSessionCookie(req: Request): string | null {
  const cookieHeader = req.headers.get("cookie");
  if (!cookieHeader) return null;
  // Local password session takes priority
  const local = cookieHeader.match(/(?:^|;\s*)__local_session=([^;]*)/);
  if (local) return local[1];
  // Clerk session
  const clerk = cookieHeader.match(/(?:^|;\s*)__session=([^;]*)/);
  return clerk ? clerk[1] : null;
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

    // API Key (sf_ prefix) — DB lookup + hash verification
    if (token.startsWith("sf_")) {
      return verifyApiKey(token);
    }

    // Try Clerk JWKS → cache or DB lookup by email
    const clerkIdentity = await verifyClerkToken(token);
    if (clerkIdentity) {
      if (clerkIdentity.email) {
        const cached = getCachedAuth(clerkIdentity.email);
        if (cached) return cached;
      }
      const result = await findUser(clerkIdentity);
      if (result && clerkIdentity.email) setCachedAuth(clerkIdentity.email, result);
      return result;
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
