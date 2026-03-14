import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import * as schema from "../src/lib/db/schema";
import { computeMasterHashes } from "../src/lib/entity-hash";
import dotenv from "dotenv";

dotenv.config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle({ client: pool });

async function main() {
  console.log("Seeding test data (v2 schema)...");

  // ---- Tenant ----
  const tenantHashes = computeMasterHashes({ name: "Dev Tenant" }, null);
  const [tenant] = await db.insert(schema.tenant).values({
    name: "Dev Tenant",
    ...tenantHashes,
  }).returning();
  console.log(`  Tenant: key=${tenant.key}`);

  // ---- Role ----
  const adminHashes = computeMasterHashes({ code: "admin", name: "Administrator", is_active: "true" }, null);
  const [adminRole] = await db.insert(schema.role).values({
    code: "admin", name: "Administrator", is_active: true,
    ...adminHashes,
  }).returning();
  console.log(`  Role: admin key=${adminRole.key}`);

  // ---- User ----
  const CLERK_USER_ID = process.env.CLERK_DEV_USER_ID || "dev_placeholder";
  const userHashes = computeMasterHashes({ external_id: CLERK_USER_ID, role_key: String(adminRole.key) }, null);
  const [usr] = await db.insert(schema.user).values({
    external_id: CLERK_USER_ID,
    tenant_key: tenant.key,
    role_key: adminRole.key,
    ...userHashes,
  }).returning();
  console.log(`  User: key=${usr.key} external_id=${CLERK_USER_ID}`);

  // ---- Book ----
  const bookHashes = computeMasterHashes({ code: "default", name: "JPY Ledger", unit: "JPY" }, null);
  const [book] = await db.insert(schema.book).values({
    tenant_key: tenant.key, created_by: usr.key,
    code: "default", name: "JPY Ledger", unit: "JPY",
    ...bookHashes,
  }).returning();
  console.log(`  Book: key=${book.key} code=${book.code}`);

  // ---- Accounts ----
  const accounts = [
    { code: "1000", name: "Cash", account_type: "asset" },
    { code: "1100", name: "Accounts Receivable", account_type: "asset" },
    { code: "1200", name: "Inventory", account_type: "asset" },
    { code: "2000", name: "Accounts Payable", account_type: "liability" },
    { code: "2100", name: "Short-term Borrowings", account_type: "liability" },
    { code: "3000", name: "Capital Stock", account_type: "equity" },
    { code: "3100", name: "Retained Earnings", account_type: "equity" },
    { code: "4000", name: "Sales Revenue", account_type: "revenue" },
    { code: "5000", name: "Cost of Goods Sold", account_type: "expense" },
    { code: "5100", name: "Salaries Expense", account_type: "expense" },
    { code: "5200", name: "Rent Expense", account_type: "expense" },
    { code: "5300", name: "Utilities Expense", account_type: "expense" },
  ];

  for (const a of accounts) {
    const h = computeMasterHashes({ code: a.code, name: a.name, account_type: a.account_type }, null);
    await db.insert(schema.account).values({
      book_key: book.key, created_by: usr.key,
      code: a.code, name: a.name, account_type: a.account_type,
      ...h,
    });
  }
  console.log(`  Accounts: ${accounts.length} created`);

  // ---- Fiscal Period ----
  const fpHashes = computeMasterHashes({ code: "2026-01", start_date: "2026-04-01", end_date: "2026-04-30", status: "open" }, null);
  await db.insert(schema.fiscalPeriod).values({
    book_key: book.key, created_by: usr.key,
    code: "2026-01",
    start_date: new Date("2026-04-01T00:00:00Z"),
    end_date: new Date("2026-04-30T23:59:59Z"),
    status: "open",
    ...fpHashes,
  });
  console.log("  Fiscal Period: 2026-01 created");

  // ---- Departments ----
  const departments = [
    { code: "SALES", name: "Sales Department" },
    { code: "ADMIN", name: "Administration" },
  ];
  for (const d of departments) {
    const h = computeMasterHashes({ code: d.code, name: d.name }, null);
    await db.insert(schema.department).values({
      tenant_key: tenant.key, created_by: usr.key,
      code: d.code, name: d.name,
      ...h,
    });
  }
  console.log(`  Departments: ${departments.length} created`);

  // ---- Counterparty ----
  const cpHashes = computeMasterHashes({ code: "CP001", name: "Test Supplier" }, null);
  await db.insert(schema.counterparty).values({
    tenant_key: tenant.key, created_by: usr.key,
    code: "CP001", name: "Test Supplier",
    ...cpHashes,
  });
  console.log("  Counterparties: 1 created");

  console.log("Seed complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => pool.end());
