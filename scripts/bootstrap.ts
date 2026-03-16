/**
 * Bootstrap: set up one usable tenant from scratch.
 *
 * 1. Generate platform API key   (DB direct — api_key is infra, not audited)
 * 2. Create tenant               (API: POST /tenants)
 * 3. Create admin user           (API: POST /tenants/{id}/users)
 * 4. Generate admin API key      (DB direct — same as step 1)
 *
 * Requires:
 *   - DATABASE_URL, JWT_SECRET in .env
 *   - Dev server running at BASE_URL (default http://localhost:3000)
 *
 * Usage: npx tsx scripts/bootstrap.ts
 */

import "dotenv/config";
import { createApiKey } from "@/lib/api-keys";

const BASE = process.env.BASE_URL || "http://localhost:3000";

// ── Config ──
const TENANT_NAME = "個人会計";
const ADMIN_EMAIL = "shiba.dog.leo.private@gmail.com";
const ADMIN_CODE = "admin001";
const ADMIN_NAME = "管理者";
const ADMIN_ROLE_ID = 100000000002; // admin role (seeded by migration)

// ── Helpers ──

async function apiPost<T>(
  path: string,
  body: Record<string, unknown>,
  token: string,
): Promise<T> {
  const res = await fetch(`${BASE}/api/v1${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(`POST ${path} failed (${res.status}): ${JSON.stringify(json)}`);
  }
  return (json as { data: T }).data;
}

// ── Main ──

async function main() {
  // 1. Platform API key
  console.log("1. Creating platform API key...");
  const { rawKey: platformKey } = await createApiKey({
    userKey: 0,
    tenantKey: 0,
    role: "platform",
    name: "bootstrap",
  });
  console.log("   done.");

  // 2. Create tenant
  console.log(`2. Creating tenant "${TENANT_NAME}"...`);
  const tenant = await apiPost<{ id: number }>(
    "/tenants",
    { name: TENANT_NAME },
    platformKey,
  );
  console.log(`   tenant id = ${tenant.id}`);

  // 3. Create admin user
  console.log(`3. Creating admin user "${ADMIN_EMAIL}"...`);
  const user = await apiPost<{ id: number }>(
    `/tenants/${tenant.id}/users`,
    {
      email: ADMIN_EMAIL,
      code: ADMIN_CODE,
      name: ADMIN_NAME,
      role_id: ADMIN_ROLE_ID,
    },
    platformKey,
  );
  console.log(`   user id = ${user.id}`);

  // 4. Admin API key (tenant-scoped)
  console.log("4. Creating admin API key...");
  const { rawKey: adminKey } = await createApiKey({
    userKey: user.id,
    tenantKey: tenant.id,
    role: "admin",
    name: "bootstrap-admin",
  });
  console.log("   done.");

  // Summary
  console.log("\n========================================");
  console.log("  Bootstrap complete");
  console.log("========================================");
  console.log(`\nPLATFORM_API_KEY=${platformKey}`);
  console.log(`ADMIN_API_KEY=${adminKey}`);
  console.log(`\nTenant: ${TENANT_NAME} (id=${tenant.id})`);
  console.log(`Admin:  ${ADMIN_EMAIL} (id=${user.id})`);
  console.log("\nAdd these keys to .env, then run seed scripts.");
  console.log("These keys will NOT be shown again.\n");

  process.exit(0);
}

main().catch((e) => {
  console.error("Bootstrap failed:", e);
  process.exit(1);
});
