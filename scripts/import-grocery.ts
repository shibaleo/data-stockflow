/**
 * Import TB__GROCERY (Notion) → data-stockflow
 *
 * Usage:
 *   npx tsx scripts/import-grocery.ts
 *
 * Prerequisites:
 *   - dev server running on localhost:3000
 *   - JWT_SECRET set in .env
 *   - grocery book already exists
 */

import * as jose from "jose";

// ── Config ──────────────────────────────────────────────────

const BASE = "http://localhost:3000";
const TENANT_ID = "00000000-0000-0000-0000-000000000001";
const USER_ID = "00000000-0000-0000-0000-000000000099";
const JWT_SECRET = process.env.JWT_SECRET ?? "FyMruWoshokahVR+MR+UUt6he+oGS+vY1PZe1bRbR+Q=";
const BOOK_CODE = "6f4c93c1-1b34-4915-8c1f-9872f995e6bf"; // grocery book

// ── Notion data ─────────────────────────────────────────────

// 4 product accounts (asset) — display_code = Notion select value
// NOTE: candy-超大粒ラムネ → ramune, meat-サラダチキン九州産鶏肉スモーク → meat-chiken (renamed)
const PRODUCT_ACCOUNTS = [
  { display_code: "monster-ruby-red", name: "Monster Ruby Red" },
  { display_code: "monster-ultra", name: "Monster Ultra" },
  { display_code: "rice-ふっくら粒立ちごはん", name: "ふっくら粒立ちごはん" },
  { display_code: "probiotic-ジャンボハーフ", name: "ジャンボハーフ" },
];

// Notion display_code → normalized display_code
const NORMALIZE: Record<string, string> = {
  "rice-ふっくら粒立ちご飯": "rice-ふっくら粒立ちごはん",
  "candy-超大粒ラムネ": "ramune",
  "meat-サラダチキン九州産鶏肉スモーク": "meat-chiken",
};

function normalize(item: string): string {
  return NORMALIZE[item] ?? item;
}

// TB__GROCERY records (31 entries)
interface GroceryRecord {
  page_id: string;
  date: string; // ISO 8601
  credit_item: string;
  credit_amount: number;
  debit_item: string;
  debit_amount: number;
  memo: string;
}

const RECORDS: GroceryRecord[] = [
  { page_id: "31f2cd76-e35b-802c-b71f-f88e4d1203d1", date: "2026-03-10T19:00:00+09:00", credit_item: "stocking", credit_amount: 24, debit_item: "monster-ultra", debit_amount: 24, memo: "モンスター受け取り" },
  { page_id: "31f2cd76-e35b-8079-9010-fa8057413b41", date: "2026-03-10T19:00:00+09:00", credit_item: "stocking", credit_amount: 24, debit_item: "monster-ruby-red", debit_amount: 24, memo: "モンスター受け取り" },
  { page_id: "31f2cd76-e35b-81e4-9542-f52255254f72", date: "2026-03-11T08:52:00+09:00", credit_item: "monster-ruby-red", credit_amount: 1, debit_item: "consumption", debit_amount: 1, memo: "朝出社後に飲用" },
  { page_id: "3202cd76-e35b-80ea-a35c-d136e8d125e3", date: "2026-03-11T12:14:00+09:00", credit_item: "stocking", credit_amount: 11, debit_item: "rice-ふっくら粒立ちご飯", debit_amount: 11, memo: "在庫棚卸" },
  { page_id: "3202cd76-e35b-803d-886d-c5ec8a0846b7", date: "2026-03-11T12:16:00+09:00", credit_item: "rice-ふっくら粒立ちごはん", credit_amount: 2, debit_item: "consumption", debit_amount: 2, memo: "昼食" },
  { page_id: "3202cd76-e35b-8058-8d0a-f19c56163fdc", date: "2026-03-11T12:31:00+09:00", credit_item: "stocking", credit_amount: 2, debit_item: "meat-サラダチキン九州産鶏肉スモーク", debit_amount: 2, memo: "在庫棚卸" },
  { page_id: "3202cd76-e35b-80b9-a269-c526073c9fa9", date: "2026-03-11T12:32:00+09:00", credit_item: "meat-サラダチキン九州産鶏肉スモーク", credit_amount: 1, debit_item: "consumption", debit_amount: 1, memo: "昼食" },
  { page_id: "3202cd76-e35b-802d-be28-ea669522c793", date: "2026-03-11T12:40:00+09:00", credit_item: "stocking", credit_amount: 6, debit_item: "probiotic-ジャンボハーフ", debit_amount: 6, memo: "在庫棚卸" },
  { page_id: "3202cd76-e35b-80f9-a7e5-eca63346652b", date: "2026-03-11T12:41:00+09:00", credit_item: "probiotic-ジャンボハーフ", credit_amount: 1, debit_item: "consumption", debit_amount: 1, memo: "昼食" },
  { page_id: "3202cd76-e35b-8026-9427-f4796df2dec5", date: "2026-03-11T13:06:00+09:00", credit_item: "monster-ultra", credit_amount: 1, debit_item: "consumption", debit_amount: 1, memo: "昼飲用" },
  { page_id: "3202cd76-e35b-812c-8480-c1a383eadeb5", date: "2026-03-11T20:20:00+09:00", credit_item: "stocking", credit_amount: 6, debit_item: "probiotic-ジャンボハーフ", debit_amount: 6, memo: "購入" },
  { page_id: "3202cd76-e35b-8151-a146-e59f36884ae7", date: "2026-03-11T20:26:00+09:00", credit_item: "rice-ふっくら粒立ちごはん", credit_amount: 1, debit_item: "rice-ふっくら粒立ちご飯", debit_amount: 1, memo: "夕食" },
  { page_id: "3202cd76-e35b-8173-8797-fb557661d23e", date: "2026-03-11T20:26:00+09:00", credit_item: "probiotic-ジャンボハーフ", credit_amount: 1, debit_item: "probiotic-ジャンボハーフ", debit_amount: 1, memo: "夕食" },
  { page_id: "3202cd76-e35b-8069-adf3-dcdc75823763", date: "2026-03-12T07:10:00+09:00", credit_item: "stocking", credit_amount: 40, debit_item: "candy-超大粒ラムネ", debit_amount: 40, memo: "在庫棚卸" },
  { page_id: "3202cd76-e35b-80e9-b74c-e0286d8ccef5", date: "2026-03-12T07:12:00+09:00", credit_item: "monster-ruby-red", credit_amount: 1, debit_item: "consumption", debit_amount: 1, memo: "眠気覚まし" },
  { page_id: "3202cd76-e35b-801b-94d6-f7b486647b5d", date: "2026-03-12T07:13:00+09:00", credit_item: "candy-超大粒ラムネ", credit_amount: 3, debit_item: "consumption", debit_amount: 3, memo: "眠気覚まし" },
  { page_id: "3212cd76-e35b-81d5-bf57-f9ea6bb02153", date: "2026-03-12T12:27:00+09:00", credit_item: "meat-サラダチキン九州産鶏肉スモーク", credit_amount: 1, debit_item: "consumption", debit_amount: 1, memo: "昼食" },
  { page_id: "3212cd76-e35b-81c5-a3ec-eb340de243c3", date: "2026-03-12T12:35:00+09:00", credit_item: "probiotic-ジャンボハーフ", credit_amount: 1, debit_item: "consumption", debit_amount: 1, memo: "昼食" },
  { page_id: "3212cd76-e35b-8139-82ba-cf07464be6cd", date: "2026-03-12T13:56:00+09:00", credit_item: "monster-ultra", credit_amount: 1, debit_item: "consumption", debit_amount: 1, memo: "昼に眠気を感じ引用" },
  { page_id: "3212cd76-e35b-8142-8d23-f073d130f946", date: "2026-03-12T19:28:00+09:00", credit_item: "rice-ふっくら粒立ちごはん", credit_amount: 1, debit_item: "consumption", debit_amount: 1, memo: "夕食" },
  { page_id: "3212cd76-e35b-813a-b65e-e026216aa7f4", date: "2026-03-12T19:30:00+09:00", credit_item: "probiotic-ジャンボハーフ", credit_amount: 1, debit_item: "consumption", debit_amount: 1, memo: "夕食" },
  { page_id: "3212cd76-e35b-8112-9135-d7a16672dd98", date: "2026-03-13T05:01:00+09:00", credit_item: "candy-超大粒ラムネ", credit_amount: 3, debit_item: "consumption", debit_amount: 3, memo: "朝目覚まし" },
  { page_id: "3212cd76-e35b-81c6-9c4a-e1fd7edc22de", date: "2026-03-13T05:02:00+09:00", credit_item: "monster-ultra", credit_amount: 1, debit_item: "consumption", debit_amount: 1, memo: "朝目覚まし" },
  { page_id: "3222cd76-e35b-81da-8b8e-c4a18dcd8411", date: "2026-03-13T12:39:00+09:00", credit_item: "monster-ruby-red", credit_amount: 1, debit_item: "consumption", debit_amount: 1, memo: "昼" },
  { page_id: "3222cd76-e35b-81cf-b156-d47c236e16a7", date: "2026-03-13T12:39:00+09:00", credit_item: "probiotic-ジャンボハーフ", credit_amount: 1, debit_item: "consumption", debit_amount: 1, memo: "昼" },
  { page_id: "3222cd76-e35b-81c8-a118-ed9fcf586795", date: "2026-03-13T18:51:00+09:00", credit_item: "rice-ふっくら粒立ちごはん", credit_amount: 1, debit_item: "consumption", debit_amount: 1, memo: "夕食" },
  { page_id: "3222cd76-e35b-81a4-888b-cf1fdd11cb75", date: "2026-03-13T18:51:00+09:00", credit_item: "probiotic-ジャンボハーフ", credit_amount: 1, debit_item: "consumption", debit_amount: 1, memo: "夕食" },
  { page_id: "3232cd76-e35b-81c5-a7b8-f937d1dd34d8", date: "2026-03-14T10:10:00+09:00", credit_item: "candy-超大粒ラムネ", credit_amount: 5, debit_item: "consumption", debit_amount: 5, memo: "朝栄養補給" },
  { page_id: "3232cd76-e35b-81b2-8370-c16fa02dba66", date: "2026-03-14T10:10:00+09:00", credit_item: "monster-ruby-red", credit_amount: 1, debit_item: "consumption", debit_amount: 1, memo: "朝目覚まし" },
  { page_id: "3232cd76-e35b-813a-a80b-e61dc17b2e51", date: "2026-03-14T12:06:00+09:00", credit_item: "probiotic-ジャンボハーフ", credit_amount: 1, debit_item: "consumption", debit_amount: 1, memo: "昼食" },
  { page_id: "3232cd76-e35b-8149-a286-e2d091e5210b", date: "2026-03-14T12:06:00+09:00", credit_item: "rice-ふっくら粒立ちごはん", credit_amount: 1, debit_item: "consumption", debit_amount: 1, memo: "昼食" },
];

// ── Helpers ──────────────────────────────────────────────────

async function getToken(): Promise<string> {
  const secret = new TextEncoder().encode(JWT_SECRET);
  return new jose.SignJWT({ tenant_id: TENANT_ID, role: "admin" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(USER_ID)
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(secret);
}

async function api<T = unknown>(
  path: string,
  options?: RequestInit
): Promise<T> {
  const token = await getToken();
  const url = `${BASE}${path}`;
  const method = (options?.method ?? "GET").toUpperCase();

  console.log(`  [api] ${method} ${path}`);
  if (options?.body) {
    console.log(`  [api] body: ${String(options.body).slice(0, 200)}`);
  }

  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...options?.headers,
    },
  });

  const text = await res.text();
  console.log(`  [api] ${res.status} ${res.statusText} — ${text.slice(0, 300)}`);

  let body: T;
  try {
    body = JSON.parse(text) as T;
  } catch {
    throw new Error(`${res.status} ${path}: non-JSON response: ${text.slice(0, 200)}`);
  }

  if (!res.ok) {
    // Duplicate → skip silently
    if (res.status === 409) return body;
    throw new Error(`${res.status} ${path}: ${JSON.stringify(body)}`);
  }
  return body;
}

const ATOM = `/api/atom/v1`;

// ── Step 1: Create product accounts ─────────────────────────

interface AccountResponse {
  data: { code: string; display_code: string; name: string };
}

async function createAccounts(): Promise<Map<string, string>> {
  console.log("\n=== Step 1: Create product accounts ===");

  // First, get existing accounts
  const existing = await api<{
    data: { code: string; display_code: string }[];
  }>(`${ATOM}/books/${BOOK_CODE}/accounts`);

  const displayToCode = new Map<string, string>();
  for (const a of existing.data) {
    displayToCode.set(a.display_code, a.code);
  }

  for (const product of PRODUCT_ACCOUNTS) {
    if (displayToCode.has(product.display_code)) {
      console.log(`  [skip] ${product.display_code} (already exists)`);
      continue;
    }
    const res = await api<AccountResponse>(
      `${ATOM}/books/${BOOK_CODE}/accounts`,
      {
        method: "POST",
        body: JSON.stringify({
          display_code: product.display_code,
          name: product.name,
          account_type: "asset",
        }),
      }
    );
    displayToCode.set(res.data.display_code, res.data.code);
    console.log(`  [created] ${product.display_code} → ${res.data.code}`);
  }

  // Also fetch stocking & consumption codes (map by both display_code and name)
  const all = await api<{
    data: { code: string; display_code: string; name: string }[];
  }>(`${ATOM}/books/${BOOK_CODE}/accounts`);

  for (const a of all.data) {
    displayToCode.set(a.display_code, a.code);
    displayToCode.set(a.name, a.code);
  }

  console.log(`  Total accounts: ${displayToCode.size}`);
  return displayToCode;
}

// ── Step 2: Create fiscal period ────────────────────────────

async function ensureFiscalPeriod(): Promise<string> {
  console.log("\n=== Step 2: Ensure fiscal period 2026-03 ===");

  const existing = await api<{
    data: { code: string; display_code: string }[];
  }>(`${ATOM}/books/${BOOK_CODE}/fiscal-periods`);

  const fp = existing.data.find((f) => f.display_code === "2026-03");
  if (fp) {
    console.log(`  [skip] 2026-03 already exists → ${fp.code}`);
    return fp.code;
  }

  const res = await api<{ data: { code: string } }>(
    `${ATOM}/books/${BOOK_CODE}/fiscal-periods`,
    {
      method: "POST",
      body: JSON.stringify({
        display_code: "2026-03",
        fiscal_year: 2026,
        period_no: 3,
        start_date: "2026-03-01T00:00:00Z",
        end_date: "2026-03-31T23:59:59Z",
        status: "open",
      }),
    }
  );
  console.log(`  [created] 2026-03 → ${res.data.code}`);
  return res.data.code;
}

// ── Step 3: Import journals ─────────────────────────────────

async function importJournals(
  accountMap: Map<string, string>,
  fpCode: string
): Promise<void> {
  console.log("\n=== Step 3: Import journals ===");

  let created = 0;
  let skipped = 0;

  for (const rec of RECORDS) {
    const idemCode = `notion-grocery:${rec.page_id}`;

    // Determine debit/credit account codes
    const creditDisplay = normalize(rec.credit_item);
    const debitDisplay = normalize(rec.debit_item);

    // Handle record #12 and #13 (product→product = consumption)
    // credit=product, debit=same product → treat as consumption
    if (creditDisplay === debitDisplay) {
      // Self-transfer = consumption pattern
      const productCode = accountMap.get(creditDisplay);
      const consumptionCode = accountMap.get("consumption");
      if (!productCode || !consumptionCode) {
        console.error(`  [error] Missing account for ${creditDisplay}`);
        continue;
      }

      try {
        await api(`${ATOM}/journals`, {
          method: "POST",
          body: JSON.stringify({
            idempotency_code: idemCode,
            fiscal_period_code: fpCode,
            posted_date: new Date(rec.date).toISOString(),
            journal_type: "auto",
            slip_category: "ordinary",
            description: rec.memo,
            source_system: "notion-grocery",
            lines: [
              {
                line_group: 1,
                side: "debit",
                account_code: consumptionCode,
                amount: rec.credit_amount,
              },
              {
                line_group: 1,
                side: "credit",
                account_code: productCode,
                amount: rec.credit_amount,
              },
            ],
          }),
        });
        created++;
        console.log(`  [created] ${rec.date.slice(5, 16)} ${rec.memo}`);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.includes("409")) {
          skipped++;
        } else {
          console.error(`  [error] ${rec.page_id}: ${msg}`);
        }
      }
      continue;
    }

    // Normal pattern: stocking→product or product→consumption
    const creditCode =
      creditDisplay === "stocking"
        ? accountMap.get("stocking")
        : accountMap.get(creditDisplay);
    const debitCode =
      debitDisplay === "consumption"
        ? accountMap.get("consumption")
        : accountMap.get(debitDisplay);

    if (!creditCode || !debitCode) {
      console.error(
        `  [error] Missing account: credit=${creditDisplay} debit=${debitDisplay}`
      );
      continue;
    }

    try {
      await api(`${ATOM}/journals`, {
        method: "POST",
        body: JSON.stringify({
          idempotency_code: idemCode,
          fiscal_period_code: fpCode,
          posted_date: new Date(rec.date).toISOString(),
          journal_type: "auto",
          slip_category: "ordinary",
          description: rec.memo,
          source_system: "notion-grocery",
          lines: [
            {
              line_group: 1,
              side: "debit",
              account_code: debitCode,
              amount: rec.credit_amount,
            },
            {
              line_group: 1,
              side: "credit",
              account_code: creditCode,
              amount: rec.credit_amount,
            },
          ],
        }),
      });
      created++;
      console.log(`  [created] ${rec.date.slice(5, 16)} ${rec.memo}`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("409")) {
        skipped++;
      } else {
        console.error(`  [error] ${rec.page_id}: ${msg}`);
      }
    }
  }

  console.log(`\n  Result: ${created} created, ${skipped} skipped (duplicate)`);
}

// ── Main ────────────────────────────────────────────────────

async function main() {
  console.log("=== TB__GROCERY → data-stockflow import ===");

  const accountMap = await createAccounts();
  const fpCode = await ensureFiscalPeriod();
  await importJournals(accountMap, fpCode);

  console.log("\n=== Done ===");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
