import * as jose from "jose";
import type { UserRole } from "@/middleware/context";

export interface AuthResult {
  userId: string;
  tenantId: string;
  role: UserRole;
}

const ROLES: readonly string[] = ["platform", "tenant", "admin", "user"];

function getSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET is not set");
  return new TextEncoder().encode(secret);
}

/**
 * Authenticate a request by verifying the Bearer JWT token.
 * Returns null if no token or invalid token.
 */
export async function authenticate(
  req: Request
): Promise<AuthResult | null> {
  const authHeader =
    req.headers.get("authorization") || req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;

  const token = authHeader.slice(7);
  try {
    const { payload } = await jose.jwtVerify(token, getSecret(), {
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

/**
 * Sign a JWT token with the given claims.
 */
export async function signToken(
  userId: string,
  tenantId: string,
  role: UserRole
): Promise<string> {
  return new jose.SignJWT({ tenant_id: tenantId, role })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime("24h")
    .sign(getSecret());
}
