/**
 * Debug: check journal revisions and their lines for a specific idempotency_code.
 * Usage: npx tsx scripts/debug-journal.ts <idempotency_code>
 */
import "dotenv/config";
import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import { sql } from "drizzle-orm";

const code = process.argv[2] || "notion-grocery:3232cd76-e35b-81c5-a7b8-f937d1dd34d8";

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle({ client: pool });

  console.log(`=== Checking journal: ${code} ===\n`);

  // All revisions
  const { rows: journals } = await db.execute(sql`
    SELECT id, idempotency_code, revision, is_active, posted_date, description
    FROM data_stockflow.journal
    WHERE idempotency_code = ${code}
    ORDER BY revision
  `);
  console.log("Journal revisions:");
  for (const j of journals as any[]) {
    console.log(`  rev ${j.revision}: id=${j.id} is_active=${j.is_active} desc="${j.description}"`);
  }

  // Current journal view
  const { rows: current } = await db.execute(sql`
    SELECT id, idempotency_code, revision, is_active, fiscal_period_code
    FROM data_stockflow.current_journal
    WHERE idempotency_code = ${code}
  `);
  console.log("\nCurrent journal (from view):");
  for (const c of current as any[]) {
    console.log(`  id=${c.id} rev=${c.revision} is_active=${c.is_active} fp=${c.fiscal_period_code}`);
  }

  // Lines for each revision
  for (const j of journals as any[]) {
    const { rows: lines } = await db.execute(sql`
      SELECT jl.id, jl.journal_id, jl.account_code, jl.side, jl.amount,
             ca.display_code, ca.name as account_name
      FROM data_stockflow.journal_line jl
      LEFT JOIN data_stockflow.current_account ca ON ca.code = jl.account_code
      WHERE jl.journal_id = ${(j as any).id}
      ORDER BY jl.line_group, jl.side
    `);
    console.log(`\n  Lines for rev ${(j as any).revision} (journal_id=${(j as any).id}):`);
    for (const l of lines as any[]) {
      console.log(`    ${l.side} ${l.display_code} (${l.account_name}) amount=${l.amount}`);
    }
  }

  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
