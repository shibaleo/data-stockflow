/**
 * Bootstrap: generate a platform API key.
 *
 * Run after migration.sql. The API key enables all platform operations
 * (create tenants, register users, etc.) via the API.
 *
 * Requires: DATABASE_URL, JWT_SECRET in .env
 * Usage: npx tsx scripts/bootstrap.ts
 */

import "dotenv/config";
import { createApiKey } from "@/lib/api-keys";

async function main() {
  const { rawKey } = await createApiKey({
    userKey: 0, tenantKey: 0, role: "platform", name: "bootstrap",
  });

  console.log("\n=== Platform API Key ===");
  console.log(rawKey);
  console.log(`\nPLATFORM_API_KEY=${rawKey}`);
  console.log("\nThis key will NOT be shown again.\n");
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
