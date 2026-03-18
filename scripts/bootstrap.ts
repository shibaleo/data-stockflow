/**
 * Bootstrap: set up one usable tenant from scratch.
 *
 * 1. Generate platform API key   (DB direct — api_key is infra, not audited)
 * 2. Configure role names/colors (API: PUT /roles, PUT /entity-colors)
 * 3. Create tenant               (API: POST /tenants)
 * 4. Create admin user           (API: POST /tenants/{id}/users)
 * 5. Set admin password          (API: POST /users/{id}/password)
 * 6. Generate admin API key      (DB direct — same as step 1)
 *
 * Requires:
 *   - DATABASE_URL, JWT_SECRET in .env
 *   - Dev server running at BASE_URL (default http://localhost:3000)
 *
 * Usage: npx tsx scripts/bootstrap.ts
 */

import "dotenv/config";
import * as fs from "node:fs";
import * as path from "node:path";
import { createApiKey } from "@/lib/api-keys";

const BASE = process.env.BASE_URL || "http://localhost:3000";

// ── Config ──
const TENANT_NAME = "個人会計";
const ADMIN_EMAIL = "shiba.dog.leo.private@gmail.com";
const ADMIN_CODE = "admin001";
const ADMIN_NAME = "管理者";
const ADMIN_ROLE_ID = 100000000001; // admin role (seeded: platform=0, admin=1, user=2, auditor=3)
const ADMIN_PASSWORD = process.argv[2] || "admin1234"; // override: npx tsx scripts/bootstrap.ts <password>

// ── Helpers ──

async function apiCall<T>(
  method: string,
  path: string,
  body: Record<string, unknown> | null,
  token: string,
): Promise<T> {
  const res = await fetch(`${BASE}/api/v1${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(`${method} ${path} failed (${res.status}): ${JSON.stringify(json)}`);
  }
  return (json as { data: T }).data;
}

const apiGet = <T>(path: string, token: string) => apiCall<T>("GET", path, null, token);
const apiPost = <T>(path: string, body: Record<string, unknown>, token: string) => apiCall<T>("POST", path, body, token);
const apiPut = <T>(path: string, body: Record<string, unknown>, token: string) => apiCall<T>("PUT", path, body, token);

function upsertEnvVar(content: string, key: string, value: string): string {
  const re = new RegExp(`^${key}=.*$`, "m");
  if (re.test(content)) {
    return content.replace(re, `${key}=${value}`);
  }
  return content.trimEnd() + `\n${key}=${value}\n`;
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

  // 2. Set role display names and colors
  console.log("2. Configuring roles...");
  const ROLE_CONFIG: { code: string; name: string; color?: string }[] = [
    { code: "platform", name: "システム",       color: "#14B8A6" },
    { code: "admin",    name: "管理者",         color: "#EF4444" },
    { code: "user",     name: "一般ユーザー" },
    { code: "auditor",  name: "監査",           color: "#22C55E" },
  ];
  const allRoles = await apiGet<{ id: number; code: string }[]>("/roles", platformKey);
  for (const rc of ROLE_CONFIG) {
    const role = allRoles.find((r) => r.code === rc.code);
    if (!role) { console.log(`   skip: ${rc.code} (not found)`); continue; }
    await apiPut(`/roles/${role.id}`, { name: rc.name }, platformKey);
    if (rc.color) {
      await apiPut("/entity-colors", { entity_type: "role", entity_key: role.id, color: rc.color }, platformKey);
    }
  }
  console.log("   done.");

  // 3. Create tenant
  console.log(`3. Creating tenant "${TENANT_NAME}"...`);
  const tenant = await apiPost<{ id: number }>(
    "/tenants",
    { name: TENANT_NAME },
    platformKey,
  );
  console.log(`   tenant id = ${tenant.id}`);

  // 4. Create admin user
  console.log(`4. Creating admin user "${ADMIN_EMAIL}"...`);
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

  // 5. Set admin password
  console.log(`5. Setting admin password...`);
  await apiPost(
    `/users/${user.id}/password`,
    { password: ADMIN_PASSWORD },
    platformKey,
  );
  console.log("   done.");

  // 6. Admin API key (tenant-scoped)
  console.log("6. Creating admin API key...");
  const { rawKey: adminKey } = await createApiKey({
    userKey: user.id,
    tenantKey: tenant.id,
    role: "admin",
    name: "bootstrap-admin",
  });
  console.log("   done.");

  // Write keys to .env
  const envPath = path.resolve(__dirname, "../.env");
  let envContent = fs.readFileSync(envPath, "utf-8");
  envContent = upsertEnvVar(envContent, "PLATFORM_API_KEY", platformKey);
  envContent = upsertEnvVar(envContent, "ADMIN_API_KEY", adminKey);
  fs.writeFileSync(envPath, envContent, "utf-8");

  // Summary
  console.log("\n========================================");
  console.log("  Bootstrap complete");
  console.log("========================================");
  console.log(`\nPLATFORM_API_KEY=${platformKey}`);
  console.log(`ADMIN_API_KEY=${adminKey}`);
  console.log(`\nTenant: ${TENANT_NAME} (id=${tenant.id})`);
  console.log(`Admin:  ${ADMIN_EMAIL} (id=${user.id})`);
  console.log(`Password: ${ADMIN_PASSWORD}`);
  console.log(`\n.env updated automatically.`);

  process.exit(0);
}

main().catch((e) => {
  console.error("Bootstrap failed:", e);
  process.exit(1);
});
