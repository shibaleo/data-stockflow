import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import * as schema from "../src/lib/db/schema";
import dotenv from "dotenv";

dotenv.config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle({ client: pool });

// ============================================================
// Test constants
// ============================================================
const TENANT_ID = "00000000-0000-0000-0000-000000000001";
const USER_ID = "00000000-0000-0000-0000-000000000099";

async function main() {
  console.log("Seeding test data...");
  console.log(`  Tenant: ${TENANT_ID}`);
  console.log(`  User:   ${USER_ID}`);

  // ---- Book ----
  const [book] = await db.insert(schema.book).values({
    tenant_id: TENANT_ID,
    code: "default",
    display_code: "default",
    name: "JPY Ledger",
    unit: "JPY",
    created_by: USER_ID,
  }).returning();
  console.log(`  Book: ${book.code} (${book.unit}) created`);

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
    await db.insert(schema.account).values({
      book_code: book.code,
      code: a.code,
      display_code: a.code,
      revision: 1,
      created_by: USER_ID,
      name: a.name,
      account_type: a.account_type,
    });
  }
  console.log(`  Accounts: ${accounts.length} created`);

  // ---- Fiscal Period ----
  await db.insert(schema.fiscalPeriod).values({
    book_code: book.code,
    code: "2026-01",
    display_code: "2026-01",
    revision: 1,
    created_by: USER_ID,
    fiscal_year: 2026,
    period_no: 1,
    start_date: new Date("2026-04-01T00:00:00Z"),
    end_date: new Date("2026-04-30T23:59:59Z"),
    status: "open",
  });
  console.log("  Fiscal Period: 2026-01 created");

  // ---- Departments ----
  const departments = [
    { code: "SALES", name: "Sales Department" },
    { code: "ADMIN", name: "Administration" },
  ];
  for (const d of departments) {
    await db.insert(schema.department).values({
      tenant_id: TENANT_ID,
      code: d.code,
      display_code: d.code,
      revision: 1,
      created_by: USER_ID,
      name: d.name,
    });
  }
  console.log(`  Departments: ${departments.length} created`);

  // ---- Counterparties ----
  await db.insert(schema.counterparty).values({
    tenant_id: TENANT_ID,
    code: "CP001",
    display_code: "CP001",
    revision: 1,
    created_by: USER_ID,
    name: "Test Supplier",
  });
  console.log("  Counterparties: 1 created");

  // ---- Tenant Setting ----
  await db.insert(schema.tenantSetting).values({
    tenant_id: TENANT_ID,
    revision: 1,
    created_by: USER_ID,
  });
  console.log("  Tenant Setting: created");

  // ---- Tenant User (dev mapping) ----
  const CLERK_USER_ID = process.env.CLERK_DEV_USER_ID || "dev_placeholder";
  await db.insert(schema.tenantUser).values({
    external_id: CLERK_USER_ID,
    tenant_id: TENANT_ID,
    user_id: USER_ID,
    role: "admin",
  });
  console.log(`  Tenant User: mapped ${CLERK_USER_ID} → ${USER_ID}`);

  console.log("Seed complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => pool.end());
