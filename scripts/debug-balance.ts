/**
 * Debug: run the balance report query directly and check results.
 */
import "dotenv/config";
import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import { sql } from "drizzle-orm";

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle({ client: pool });

  const bookCode = "6f4c93c1-1b34-4915-8c1f-9872f995e6bf";
  const tenantId = "00000000-0000-0000-0000-000000000001";

  // Check: for candy-超大粒ラムネ account, what journal_lines exist via current_journal?
  const { rows: candyAccounts } = await db.execute(sql`
    SELECT code, display_code, name, is_active
    FROM data_stockflow.current_account
    WHERE book_code = ${bookCode} AND display_code LIKE 'candy%'
  `);
  console.log("Candy accounts:");
  for (const a of candyAccounts as any[]) {
    console.log(`  ${a.display_code} code=${a.code} is_active=${a.is_active}`);

    // Check lines via current_journal
    const { rows: lines } = await db.execute(sql`
      SELECT jl.amount, jl.side, jl.journal_id, cj.revision, cj.idempotency_code
      FROM data_stockflow.journal_line jl
      JOIN data_stockflow.current_journal cj
        ON cj.id = jl.journal_id AND cj.tenant_id = jl.tenant_id
        AND cj.is_active = true
      WHERE jl.tenant_id = ${tenantId}
        AND jl.account_code = ${(a as any).code}
    `);
    console.log(`    Lines via current_journal: ${(lines as any[]).length}`);
    let sum = 0;
    for (const l of lines as any[]) {
      const amt = Number(l.amount);
      sum += amt;
      console.log(`      ${l.side} ${l.amount} (rev ${l.revision}, ${l.idempotency_code})`);
    }
    console.log(`    Sum: ${sum}`);
  }

  // Also check ramune
  const { rows: ramuneAccounts } = await db.execute(sql`
    SELECT code, display_code, name, is_active
    FROM data_stockflow.current_account
    WHERE book_code = ${bookCode} AND display_code = 'ramune'
  `);
  console.log("\nRamune accounts:");
  for (const a of ramuneAccounts as any[]) {
    console.log(`  ${a.display_code} code=${a.code} is_active=${a.is_active}`);
    const { rows: lines } = await db.execute(sql`
      SELECT jl.amount, jl.side, jl.journal_id, cj.revision, cj.idempotency_code
      FROM data_stockflow.journal_line jl
      JOIN data_stockflow.current_journal cj
        ON cj.id = jl.journal_id AND cj.tenant_id = jl.tenant_id
        AND cj.is_active = true
      WHERE jl.tenant_id = ${tenantId}
        AND jl.account_code = ${(a as any).code}
    `);
    console.log(`    Lines via current_journal: ${(lines as any[]).length}`);
  }

  // Check consumption account
  const { rows: consumptionLines } = await db.execute(sql`
    SELECT SUM(jl.amount::numeric) as total
    FROM data_stockflow.journal_line jl
    JOIN data_stockflow.current_journal cj
      ON cj.id = jl.journal_id AND cj.tenant_id = jl.tenant_id
      AND cj.is_active = true
    WHERE jl.tenant_id = ${tenantId}
  `);
  console.log("\nTotal of all lines via current_journal:", (consumptionLines as any[])[0]?.total);

  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
