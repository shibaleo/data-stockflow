/**
 * Seed grocery book + accounts via API.
 *
 * Requires:
 *   - ADMIN_API_KEY in .env (from bootstrap)
 *   - Dev server running at BASE_URL
 *
 * Usage: node scripts/seed-grocery.mjs
 */

import "dotenv/config";

const BASE = process.env.BASE_URL || "http://localhost:3000";
const API = `${BASE}/api/v1`;
const TOKEN = process.env.ADMIN_API_KEY;
if (!TOKEN) { console.error("ADMIN_API_KEY is not set"); process.exit(1); }

async function post(path, body) {
  const res = await fetch(`${API}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) { console.error(`  FAIL POST ${path}: ${JSON.stringify(data)}`); return null; }
  return data.data;
}

async function acct(bookId, body) {
  const d = await post(`/books/${bookId}/accounts`, body);
  if (d) console.log(`  ${d.code} ${d.name} → id=${d.id}`);
  return d?.id;
}

// ── Create grocery book ──
console.log("=== Grocery book ===");
const book = await post("/books", {
  code: "grocery", name: "食料品", unit: "pieces",
  unit_symbol: "個", unit_position: "right",
  type_labels: { asset: "在庫", revenue: "入荷", expense: "消費" },
});
if (!book) { console.error("Failed to create grocery book"); process.exit(1); }
const BOOK_ID = book.id;
console.log(`  grocery → id=${BOOK_ID}`);

// ── Root accounts ──
console.log("\n=== Root accounts ===");
const foodId = await acct(BOOK_ID, { code: "01", name: "食料", account_type: "asset" });
await acct(BOOK_ID, { code: "04", name: "stocking", account_type: "revenue" });
await acct(BOOK_ID, { code: "05", name: "consumption", account_type: "expense" });

// ── Category accounts ──
console.log("\n=== Category accounts ===");
const candyId = await acct(BOOK_ID, { code: "candy", name: "キャンディ", account_type: "asset", parent_account_id: foodId });
const drinkId = await acct(BOOK_ID, { code: "drink", name: "飲み物", account_type: "asset", parent_account_id: foodId });
const meatId  = await acct(BOOK_ID, { code: "meat",  name: "肉",     account_type: "asset", parent_account_id: foodId });
const riceId  = await acct(BOOK_ID, { code: "rice",  name: "米",     account_type: "asset", parent_account_id: foodId });

// ── Leaf accounts ──
console.log("\n=== Leaf accounts ===");
await acct(BOOK_ID, { code: "ramune-cr",    name: "超大粒ラムネ",               account_type: "asset", parent_account_id: candyId });
await acct(BOOK_ID, { code: "monster-rr",   name: "Monster Ruby Red",            account_type: "asset", parent_account_id: drinkId });
await acct(BOOK_ID, { code: "monster-ut",   name: "Monster Ultra",               account_type: "asset", parent_account_id: drinkId });
await acct(BOOK_ID, { code: "probiotic-jh", name: "ジャンボハーフ",             account_type: "asset", parent_account_id: drinkId });
await acct(BOOK_ID, { code: "chicken-scs",  name: "サラダチキン九州産鶏肉スモーク", account_type: "asset", parent_account_id: meatId });
await acct(BOOK_ID, { code: "rice-ftg",     name: "ふっくら粒立ちごはん",       account_type: "asset", parent_account_id: riceId });

console.log("\nDone!");
