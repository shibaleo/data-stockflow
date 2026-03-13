import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import dotenv from "dotenv";

dotenv.config();

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
});
const prisma = new PrismaClient({ adapter });

// ============================================================
// Test constants
// ============================================================
const TENANT_ID = "00000000-0000-0000-0000-000000000001";
const USER_ID = "00000000-0000-0000-0000-000000000099";

async function main() {
  console.log("Seeding test data...");
  console.log(`  Tenant: ${TENANT_ID}`);
  console.log(`  User:   ${USER_ID}`);

  // ---- Accounts ----
  const accounts = [
    { code: "1000", name: "Cash", account_type: "asset", sign: -1 },
    { code: "1100", name: "Accounts Receivable", account_type: "asset", sign: -1 },
    { code: "1200", name: "Inventory", account_type: "asset", sign: -1 },
    { code: "2000", name: "Accounts Payable", account_type: "liability", sign: 1 },
    { code: "2100", name: "Short-term Borrowings", account_type: "liability", sign: 1 },
    { code: "3000", name: "Capital Stock", account_type: "equity", sign: 1 },
    { code: "3100", name: "Retained Earnings", account_type: "equity", sign: 1 },
    { code: "4000", name: "Sales Revenue", account_type: "revenue", sign: 1 },
    { code: "5000", name: "Cost of Goods Sold", account_type: "expense", sign: -1 },
    { code: "5100", name: "Salaries Expense", account_type: "expense", sign: -1 },
    { code: "5200", name: "Rent Expense", account_type: "expense", sign: -1 },
    { code: "5300", name: "Utilities Expense", account_type: "expense", sign: -1 },
  ];

  for (const a of accounts) {
    await prisma.account.create({
      data: {
        tenant_id: TENANT_ID,
        code: a.code,
        revision: 1,
        created_by: USER_ID,
        name: a.name,
        account_type: a.account_type,
        sign: a.sign,
      },
    });
  }
  console.log(`  Accounts: ${accounts.length} created`);

  // ---- Fiscal Period ----
  await prisma.fiscalPeriod.create({
    data: {
      tenant_id: TENANT_ID,
      code: "2026-01",
      revision: 1,
      created_by: USER_ID,
      fiscal_year: 2026,
      period_no: 1,
      start_date: new Date("2026-04-01T00:00:00Z"),
      end_date: new Date("2026-04-30T23:59:59Z"),
      status: "open",
    },
  });
  console.log("  Fiscal Period: 2026-01 created");

  // ---- Departments ----
  const departments = [
    { code: "SALES", name: "Sales Department" },
    { code: "ADMIN", name: "Administration" },
  ];
  for (const d of departments) {
    await prisma.department.create({
      data: {
        tenant_id: TENANT_ID,
        code: d.code,
        revision: 1,
        created_by: USER_ID,
        name: d.name,
      },
    });
  }
  console.log(`  Departments: ${departments.length} created`);

  // ---- Counterparties ----
  await prisma.counterparty.create({
    data: {
      tenant_id: TENANT_ID,
      code: "CP001",
      revision: 1,
      created_by: USER_ID,
      name: "Test Supplier",
    },
  });
  console.log("  Counterparties: 1 created");

  // ---- Tenant Setting ----
  await prisma.tenantSetting.create({
    data: {
      tenant_id: TENANT_ID,
      revision: 1,
      created_by: USER_ID,
    },
  });
  console.log("  Tenant Setting: created");

  console.log("Seed complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
