/**
 * Fix journals that reference duplicate account codes created by re-import.
 * Replaces duplicate account codes with the correct renamed ones via PUT API.
 *
 * Usage:
 *   npx tsx scripts/fix-duplicate-accounts.ts
 */

import "dotenv/config";
import * as jose from "jose";

const BASE = "http://localhost:3000";
const TENANT_ID = "00000000-0000-0000-0000-000000000001";
const USER_ID = "00000000-0000-0000-0000-000000000099";
const JWT_SECRET = process.env.JWT_SECRET ?? "FyMruWoshokahVR+MR+UUt6he+oGS+vY1PZe1bRbR+Q=";

// Duplicate account code → correct account code
const REPLACEMENTS: Record<string, string> = {
  // candy-超大粒ラムネ (duplicate, created by re-import) → ramune (correct)
  "03f17cdb-efb4-4094-89eb-278ea4097718": "b4b1f93f-8cd5-4393-ab85-15b5ee12b761",
  // meat-サラダチキン九州産鶏肉スモーク (duplicate) → meat-chiken (correct)
  "114a6b93-6033-4efe-8c79-5cfe3f90bb6d": "eb139bc2-2966-495b-ada5-3e4094524a06",
};

async function makeToken(): Promise<string> {
  const secret = new TextEncoder().encode(JWT_SECRET);
  return new jose.SignJWT({ sub: USER_ID, tenant_id: TENANT_ID, role: "admin" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(secret);
}

interface JournalLine {
  line_group: number;
  side: string;
  account_code: string;
  amount: string;
  department_code?: string;
  counterparty_code?: string;
  tax_class_code?: string;
  tax_rate?: string;
  is_reduced?: boolean;
  description?: string;
}

interface JournalDetail {
  data: {
    idempotency_code: string;
    revision: number;
    posted_date: string;
    journal_type: string;
    slip_category: string;
    adjustment_flag: string;
    description: string | null;
    lines: JournalLine[];
    tags: string[];
  };
}

async function main() {
  const token = await makeToken();
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };

  // 1. Get all grocery journals
  const listRes = await fetch(
    `${BASE}/api/atom/v1/journals?limit=200`,
    { headers }
  );
  const listData = await listRes.json() as { data: { idempotency_code: string }[] };
  const groceryJournals = listData.data.filter(
    (j) => j.idempotency_code.startsWith("notion-grocery:")
  );

  console.log(`Found ${groceryJournals.length} grocery journals\n`);

  let ok = 0;
  let skip = 0;
  let fail = 0;

  for (const j of groceryJournals) {
    const code = j.idempotency_code;

    // 2. Get journal detail
    const detailRes = await fetch(
      `${BASE}/api/atom/v1/journals/${encodeURIComponent(code)}`,
      { headers }
    );
    if (!detailRes.ok) {
      console.log(`  [skip] ${code} — cannot fetch: ${detailRes.status}`);
      skip++;
      continue;
    }
    const detail = await detailRes.json() as JournalDetail;
    const journal = detail.data;

    // 3. Check if any line uses a duplicate account
    const needsFix = journal.lines.some((l) => REPLACEMENTS[l.account_code]);
    if (!needsFix) {
      skip++;
      continue;
    }

    // 4. Replace account codes
    const correctedLines = journal.lines.map((l) => ({
      line_group: l.line_group,
      side: l.side,
      account_code: REPLACEMENTS[l.account_code] ?? l.account_code,
      amount: Math.abs(Number(l.amount)),
      department_code: l.department_code || undefined,
      counterparty_code: l.counterparty_code || undefined,
      tax_class_code: l.tax_class_code || undefined,
      tax_rate: l.tax_rate != null ? Number(l.tax_rate) : undefined,
      is_reduced: l.is_reduced || undefined,
      description: l.description || undefined,
    }));

    // Ensure posted_date is valid ISO 8601 (Drizzle may return PG format like "2026-03-14 01:10:00+00")
    const postedDate = new Date(journal.posted_date).toISOString();

    const body = {
      posted_date: postedDate,
      journal_type: journal.journal_type,
      slip_category: journal.slip_category,
      description: journal.description,
      lines: correctedLines,
    };

    console.log(`  PUT ${code}`);
    console.log(`    ${journal.description} — replacing: ${journal.lines.filter((l) => REPLACEMENTS[l.account_code]).map((l) => l.account_code).join(", ")}`);

    const putRes = await fetch(
      `${BASE}/api/atom/v1/journals/${encodeURIComponent(code)}`,
      {
        method: "PUT",
        headers,
        body: JSON.stringify(body),
      }
    );

    if (putRes.ok) {
      const data = await putRes.json() as { data: { revision: number } };
      console.log(`    ok rev ${data.data.revision}`);
      ok++;
    } else {
      const text = await putRes.text();
      console.log(`    FAIL ${putRes.status}: ${text}`);
      fail++;
    }
  }

  console.log(`\n=== Done: ${ok} fixed, ${skip} skipped, ${fail} failed ===`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
