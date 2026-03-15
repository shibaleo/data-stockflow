/**
 * Seed grocery book + accounts via API.
 * Usage: node dev/seed-grocery.mjs
 *
 * Requires PLATFORM_API_KEY in .env
 */

import "dotenv/config";

const BASE = process.env.BASE_URL || "http://localhost:3000";
const API = `${BASE}/api/v1`;
const TOKEN = process.env.PLATFORM_API_KEY;
if (!TOKEN) { console.error("PLATFORM_API_KEY is not set"); process.exit(1); }

async function api(method, path, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${TOKEN}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) {
    console.error(`  FAIL ${method} ${path}: ${JSON.stringify(data)}`);
    return null;
  }
  return data.data;
}

async function createBook(body) {
  const d = await api("POST", "/books", body);
  if (d) console.log(`  Book: ${d.code} → id=${d.id}`);
  return d?.id;
}

async function createAccount(bookId, body) {
  const d = await api("POST", `/books/${bookId}/accounts`, body);
  if (d) console.log(`  Account: ${d.code} → id=${d.id}`);
  return d?.id;
}

async function main() {

  // ── Create grocery book ──
  console.log("=== Grocery book ===");
  const groceryId = await createBook({
    code: "grocery", name: "食料品", unit: "pieces", unit_symbol: "個", unit_position: "right",
    type_labels: { asset: "在庫", revenue: "入荷", expense: "消費" },
  });
  if (!groceryId) { console.error("Failed to create grocery book"); return; }

  // ── Root accounts ──
  console.log("\n=== Root accounts ===");
  const foodId = await createAccount(groceryId, { code: "01", name: "食料", account_type: "asset" });
  await createAccount(groceryId, { code: "04", name: "stocking", account_type: "revenue" });
  await createAccount(groceryId, { code: "05", name: "consumption", account_type: "expense" });

  // ── Category accounts ──
  console.log("\n=== Category accounts ===");
  const candyId = await createAccount(groceryId, { code: "candy", name: "キャンディ", account_type: "asset", parent_account_id: foodId });
  const drinkId = await createAccount(groceryId, { code: "drink", name: "飲み物", account_type: "asset", parent_account_id: foodId });
  const meatId  = await createAccount(groceryId, { code: "meat",  name: "肉",     account_type: "asset", parent_account_id: foodId });
  const riceId  = await createAccount(groceryId, { code: "rice",  name: "米",     account_type: "asset", parent_account_id: foodId });

  // ── Leaf accounts ──
  console.log("\n=== Leaf accounts ===");
  await createAccount(groceryId, { code: "ramune-cr",    name: "超大粒ラムネ",               account_type: "asset", parent_account_id: candyId });
  await createAccount(groceryId, { code: "monster-rr",   name: "Monster Ruby Red",            account_type: "asset", parent_account_id: drinkId });
  await createAccount(groceryId, { code: "monster-ut",   name: "Monster Ultra",               account_type: "asset", parent_account_id: drinkId });
  await createAccount(groceryId, { code: "probiotic-jh", name: "ジャンボハーフ",             account_type: "asset", parent_account_id: drinkId });
  await createAccount(groceryId, { code: "chicken-scs",  name: "サラダチキン九州産鶏肉スモーク", account_type: "asset", parent_account_id: meatId });
  await createAccount(groceryId, { code: "rice-ftg",     name: "ふっくら粒立ちごはん",       account_type: "asset", parent_account_id: riceId });

  console.log("\nDone!");
}

main().catch(console.error);
