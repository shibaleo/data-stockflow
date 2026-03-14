/**
 * Delete all grocery journals (notion-grocery:*) from the database.
 * Uses direct DB connection via Drizzle.
 *
 * Usage:
 *   npx tsx scripts/truncate-grocery-journals.ts
 */

import "dotenv/config";
import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import { sql } from "drizzle-orm";

const S = "data_stockflow";

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle({ client: pool });

  // Count
  const { rows: countRows } = await db.execute(sql`
    SELECT COUNT(*) as cnt FROM "${sql.raw(S)}"."journal_header"
    WHERE idempotency_code LIKE 'notion-grocery:%'
  `);
  const count = Number((countRows as { cnt: bigint }[])[0].cnt);
  console.log(`Found ${count} grocery journal headers`);

  if (count === 0) {
    console.log("Nothing to delete.");
    await pool.end();
    return;
  }

  // Delete using subqueries to avoid array parameter issues
  // 1. journal_tag
  const { rowCount: tagCount } = await db.execute(sql`
    DELETE FROM "${sql.raw(S)}"."journal_tag"
    WHERE journal_id IN (
      SELECT id FROM "${sql.raw(S)}"."journal"
      WHERE idempotency_code LIKE 'notion-grocery:%'
    )
  `);
  console.log(`Deleted ${tagCount} journal_tag rows`);

  // 2. journal_line
  const { rowCount: lineCount } = await db.execute(sql`
    DELETE FROM "${sql.raw(S)}"."journal_line"
    WHERE journal_id IN (
      SELECT id FROM "${sql.raw(S)}"."journal"
      WHERE idempotency_code LIKE 'notion-grocery:%'
    )
  `);
  console.log(`Deleted ${lineCount} journal_line rows`);

  // 3. journal
  const { rowCount: journalCount } = await db.execute(sql`
    DELETE FROM "${sql.raw(S)}"."journal"
    WHERE idempotency_code LIKE 'notion-grocery:%'
  `);
  console.log(`Deleted ${journalCount} journal rows`);

  // 4. journal_header
  const { rowCount: headerCount } = await db.execute(sql`
    DELETE FROM "${sql.raw(S)}"."journal_header"
    WHERE idempotency_code LIKE 'notion-grocery:%'
  `);
  console.log(`Deleted ${headerCount} journal_header rows`);

  console.log("\nDone. Grocery journals have been removed.");
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
