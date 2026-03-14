/**
 * Deactivate duplicate accounts created by re-import.
 * Usage: npx tsx scripts/deactivate-duplicate-accounts.ts
 */

import * as jose from "jose";

const BASE = "http://localhost:3000";
const TENANT_ID = "00000000-0000-0000-0000-000000000001";
const USER_ID = "00000000-0000-0000-0000-000000000099";
const JWT_SECRET = process.env.JWT_SECRET ?? "FyMruWoshokahVR+MR+UUt6he+oGS+vY1PZe1bRbR+Q=";
const BOOK_CODE = "6f4c93c1-1b34-4915-8c1f-9872f995e6bf";

// Duplicate account codes to deactivate
const DUPLICATES = [
  "03f17cdb-efb4-4094-89eb-278ea4097718", // candy-超大粒ラムネ (duplicate)
  "114a6b93-6033-4efe-8c79-5cfe3f90bb6d", // meat-サラダチキン九州産鶏肉スモーク (duplicate)
];

async function makeToken(): Promise<string> {
  const secret = new TextEncoder().encode(JWT_SECRET);
  return new jose.SignJWT({ sub: USER_ID, tenant_id: TENANT_ID, role: "admin" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(secret);
}

async function main() {
  const token = await makeToken();
  const headers = { Authorization: `Bearer ${token}` };

  for (const code of DUPLICATES) {
    const url = `${BASE}/api/atom/v1/books/${BOOK_CODE}/accounts/${code}`;
    console.log(`DELETE ${code}`);
    const res = await fetch(url, { method: "DELETE", headers });
    const text = await res.text();
    console.log(`  ${res.status}: ${text}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
