import * as jose from "jose";
import { db } from "@/lib/db";
import { tenantUser } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import type { UserRole } from "@/middleware/context";

export interface AuthResult {
  userId: string;
  tenantId: string;
  role: UserRole;
}

const ROLES: readonly string[] = ["platform", "audit", "tenant", "admin", "user"];

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

/**
 * Verify Clerk JWT and return the Clerk user ID (sub claim).
 */
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
 * Look up tenant_user by external_id (Clerk user ID).
 * Auto-creates a record on first login using DEFAULT_TENANT_ID from env.
 */
async function findOrCreateTenantUser(
  externalId: string
): Promise<AuthResult | null> {
  // Try to find existing mapping
  const [existing] = await db
    .select()
    .from(tenantUser)
    .where(eq(tenantUser.external_id, externalId))
    .limit(1);
  if (existing) {
    if (!ROLES.includes(existing.role)) return null;
    return {
      userId: existing.user_id,
      tenantId: existing.tenant_id,
      role: existing.role as UserRole,
    };
  }

  // Auto-create on first login
  const defaultTenantId =
    process.env.DEFAULT_TENANT_ID || "00000000-0000-0000-0000-000000000001";
  const [created] = await db
    .insert(tenantUser)
    .values({
      external_id: externalId,
      tenant_id: defaultTenantId,
      role: "user",
    })
    .returning();
  return {
    userId: created.user_id,
    tenantId: created.tenant_id,
    role: created.role as UserRole,
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
    const userId = payload.sub;
    const tenantId = payload.tenant_id as string | undefined;
    const role = payload.role as string | undefined;
    if (!userId || !tenantId || !role) return null;
    if (!ROLES.includes(role)) return null;
    return { userId, tenantId, role: role as UserRole };
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

/**
 * Authenticate a request.
 * Flow: Bearer/cookie token → Clerk JWKS (sub → DB lookup) → dev HS256 fallback
 */
export async function authenticate(
  req: Request
): Promise<AuthResult | null> {
  const bearerToken = extractBearerToken(req);
  const cookieToken = extractSessionCookie(req);

  console.log("[auth] bearer:", !!bearerToken, "cookie:", !!cookieToken);

  for (const token of [bearerToken, cookieToken]) {
    if (!token) continue;

    // Try Clerk JWKS → DB lookup
    const clerkUserId = await verifyClerkToken(token);
    console.log("[auth] clerkUserId:", clerkUserId);
    if (clerkUserId) {
      const result = await findOrCreateTenantUser(clerkUserId);
      console.log("[auth] tenantUser result:", result);
      return result;
    }

    // Fallback: dev HS256 token (claims embedded in JWT)
    const devResult = await verifyDevToken(token);
    if (devResult) return devResult;
  }

  return null;
}

/**
 * Sign a dev JWT token (for testing/curl usage).
 */
export async function signToken(
  userId: string,
  tenantId: string,
  role: UserRole
): Promise<string> {
  const secret = getSecret();
  if (!secret) throw new Error("JWT_SECRET is not set");
  return new jose.SignJWT({ tenant_id: tenantId, role })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime("24h")
    .sign(secret);
}
