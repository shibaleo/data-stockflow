/**
 * Bootstrap: generate a platform API key for the bootstrap admin user.
 * Usage: npx tsx dev/bootstrap.ts
 *
 * Requires DATABASE_URL and JWT_SECRET in .env (loaded by Next.js convention).
 */

import "dotenv/config";
import { createApiKey } from "@/lib/api-keys";

const PLATFORM_USER_KEY = 100000000000; // bootstrap admin user
const PLATFORM_TENANT_KEY = 100000000000; // bootstrap tenant

async function main() {
  const { rawKey } = await createApiKey({
    userKey: PLATFORM_USER_KEY,
    tenantKey: PLATFORM_TENANT_KEY,
    role: "platform",
    name: "bootstrap",
  });

  console.log("\n=== Platform API Key (bootstrap) ===");
  console.log(rawKey);
  console.log("\nUsage:");
  console.log(`  curl -H "Authorization: Bearer ${rawKey.slice(0, 20)}..." ...`);
  console.log("\nThis key will NOT be shown again.\n");

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
