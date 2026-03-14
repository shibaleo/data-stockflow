/**
 * Fix journals that reference inactive account codes.
 * Uses PUT /journals/{code} API to create corrected revisions.
 *
 * Usage:
 *   npx tsx scripts/fix-inactive-accounts.ts
 */

import * as jose from "jose";

const BASE = "http://localhost:3000";
const TENANT_ID = "00000000-0000-0000-0000-000000000001";
const USER_ID = "00000000-0000-0000-0000-000000000099";
const JWT_SECRET = process.env.JWT_SECRET ?? "FyMruWoshokahVR+MR+UUt6he+oGS+vY1PZe1bRbR+Q=";

// Inactive account code → active replacement code
const REPLACEMENTS: Record<string, string> = {
  // candy-超大粒ラムネ (inactive) → ramune (active)
  "8972e6f4-93f6-47ef-afa9-dc394bf9dc8f": "b4b1f93f-8cd5-4393-ab85-15b5ee12b761",
  // meat-サラダチキン九州産鶏肉スモーク (inactive) → meat-chiken (active)
  "64151a8a-a5c4-430f-a6b7-abda848d834e": "eb139bc2-2966-495b-ada5-3e4094524a06",
};

// Affected journals with their full line data
const FIXES = [
  {
    code: "notion-grocery:3202cd76-e35b-8058-8d0a-f19c56163fdc",
    posted_date: "2026-03-11T03:31:00.000Z",
    description: "在庫棚卸",
    lines: [
      { line_group: 1, side: "debit", account_code: "64151a8a-a5c4-430f-a6b7-abda848d834e", amount: 2 },
      { line_group: 1, side: "credit", account_code: "1c9a56c9-8690-4459-9dd6-dc0ff9be5410", amount: 2 },
    ],
  },
  {
    code: "notion-grocery:3202cd76-e35b-80b9-a269-c526073c9fa9",
    posted_date: "2026-03-11T03:32:00.000Z",
    description: "昼食",
    lines: [
      { line_group: 1, side: "debit", account_code: "039784dc-0330-4290-bd0d-c050fede3f12", amount: 1 },
      { line_group: 1, side: "credit", account_code: "64151a8a-a5c4-430f-a6b7-abda848d834e", amount: 1 },
    ],
  },
  {
    code: "notion-grocery:3202cd76-e35b-8069-adf3-dcdc75823763",
    posted_date: "2026-03-11T22:10:00.000Z",
    description: "在庫棚卸",
    lines: [
      { line_group: 1, side: "debit", account_code: "8972e6f4-93f6-47ef-afa9-dc394bf9dc8f", amount: 40 },
      { line_group: 1, side: "credit", account_code: "1c9a56c9-8690-4459-9dd6-dc0ff9be5410", amount: 40 },
    ],
  },
  {
    code: "notion-grocery:3202cd76-e35b-801b-94d6-f7b486647b5d",
    posted_date: "2026-03-11T22:13:00.000Z",
    description: "眠気覚まし",
    lines: [
      { line_group: 1, side: "debit", account_code: "039784dc-0330-4290-bd0d-c050fede3f12", amount: 3 },
      { line_group: 1, side: "credit", account_code: "8972e6f4-93f6-47ef-afa9-dc394bf9dc8f", amount: 3 },
    ],
  },
  {
    code: "notion-grocery:3212cd76-e35b-81d5-bf57-f9ea6bb02153",
    posted_date: "2026-03-12T03:27:00.000Z",
    description: "昼食",
    lines: [
      { line_group: 1, side: "debit", account_code: "039784dc-0330-4290-bd0d-c050fede3f12", amount: 1 },
      { line_group: 1, side: "credit", account_code: "64151a8a-a5c4-430f-a6b7-abda848d834e", amount: 1 },
    ],
  },
  {
    code: "notion-grocery:3212cd76-e35b-8112-9135-d7a16672dd98",
    posted_date: "2026-03-12T20:01:00.000Z",
    description: "朝目覚まし",
    lines: [
      { line_group: 1, side: "debit", account_code: "039784dc-0330-4290-bd0d-c050fede3f12", amount: 3 },
      { line_group: 1, side: "credit", account_code: "8972e6f4-93f6-47ef-afa9-dc394bf9dc8f", amount: 3 },
    ],
  },
  {
    code: "notion-grocery:3232cd76-e35b-81c5-a7b8-f937d1dd34d8",
    posted_date: "2026-03-14T01:10:00.000Z",
    description: "朝栄養補給",
    lines: [
      { line_group: 1, side: "debit", account_code: "039784dc-0330-4290-bd0d-c050fede3f12", amount: 5 },
      { line_group: 1, side: "credit", account_code: "8972e6f4-93f6-47ef-afa9-dc394bf9dc8f", amount: 5 },
    ],
  },
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
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };

  console.log(`=== Fix inactive account references (${FIXES.length} journals) ===\n`);

  let ok = 0;
  let fail = 0;

  for (const fix of FIXES) {
    // Replace inactive account codes with active ones
    const correctedLines = fix.lines.map((l) => ({
      ...l,
      account_code: REPLACEMENTS[l.account_code] ?? l.account_code,
    }));

    const body = {
      posted_date: fix.posted_date,
      journal_type: "auto",
      slip_category: "ordinary",
      description: fix.description,
      lines: correctedLines,
    };

    const url = `${BASE}/api/atom/v1/journals/${encodeURIComponent(fix.code)}`;
    console.log(`  PUT ${fix.code}`);
    console.log(`    ${fix.description} — replacing: ${fix.lines.filter((l) => REPLACEMENTS[l.account_code]).map((l) => l.account_code).join(", ")}`);

    const res = await fetch(url, {
      method: "PUT",
      headers,
      body: JSON.stringify(body),
    });

    if (res.ok) {
      const data = await res.json();
      console.log(`    ✓ rev ${data.data.revision}`);
      ok++;
    } else {
      const text = await res.text();
      console.log(`    ✗ ${res.status}: ${text}`);
      fail++;
    }
  }

  console.log(`\n=== Done: ${ok} fixed, ${fail} failed ===`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
