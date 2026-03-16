/**
 * Seed: accounting book with full chart of accounts + foundation masters.
 *
 * Creates:
 *   - General book (一般帳簿)
 *   - Fiscal period (FY2025)
 *   - Categories (journal_type x2, journal_tag x3)
 *   - Department, Counterparty, Project (defaults)
 *   - Full chart of accounts
 *   - Sample vouchers (x2)
 *
 * Requires:
 *   - ADMIN_API_KEY in .env (from bootstrap)
 *   - Dev server running at BASE_URL
 *
 * Usage: node scripts/seed-accounting.mjs
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

// ============================================================
// 1. General book
// ============================================================

console.log("=== 帳簿 ===");
const book = await post("/books", {
  code: "general", name: "一般帳簿", unit: "円",
  unit_symbol: "¥", unit_position: "left",
  type_labels: { asset: "資産", liability: "負債", equity: "純資産", revenue: "収益", expense: "費用" },
});
if (!book) { console.error("Failed to create book"); process.exit(1); }
const BOOK_ID = book.id;
console.log(`  general → id=${BOOK_ID}`);

// ============================================================
// 2. Fiscal period
// ============================================================

console.log("\n=== 会計期間 ===");
const period = await post("/periods", {
  code: "FY2025",
  start_date: "2025-04-01T00:00:00Z",
  end_date: "2026-03-31T23:59:59Z",
  status: "open",
});
if (period) console.log(`  FY2025 → id=${period.id}`);

// ============================================================
// 3. Categories
// ============================================================

console.log("\n=== カテゴリ ===");

const catNormal = await post("/categories", {
  category_type_code: "journal_type", code: "normal", name: "経常",
});
if (catNormal) console.log(`  journal_type/normal → id=${catNormal.id}`);

const catSpecial = await post("/categories", {
  category_type_code: "journal_type", code: "special", name: "特別",
});
if (catSpecial) console.log(`  journal_type/special → id=${catSpecial.id}`);

const tagFixed = await post("/categories", {
  category_type_code: "journal_tag", code: "fixed", name: "固定費",
});
if (tagFixed) console.log(`  journal_tag/fixed → id=${tagFixed.id}`);

const tagVariable = await post("/categories", {
  category_type_code: "journal_tag", code: "variable", name: "変動費",
});
if (tagVariable) console.log(`  journal_tag/variable → id=${tagVariable.id}`);

const tagSalary = await post("/categories", {
  category_type_code: "journal_tag", code: "salary", name: "給与",
});
if (tagSalary) console.log(`  journal_tag/salary → id=${tagSalary.id}`);

// ============================================================
// 4. Department / Counterparty / Project
// ============================================================

console.log("\n=== 部門・取引先・プロジェクト ===");

const dept = await post("/departments", { code: "personal", name: "個人" });
if (dept) console.log(`  department/personal → id=${dept.id}`);

const cp = await post("/counterparties", { code: "self", name: "個人" });
if (cp) console.log(`  counterparty/self → id=${cp.id}`);

const proj = await post("/projects", { code: "default", name: "デフォルト" });
if (proj) console.log(`  project/default → id=${proj.id}`);

// ============================================================
// 5. Chart of accounts
// ============================================================

async function acct(body) {
  const d = await post(`/books/${BOOK_ID}/accounts`, body);
  if (d) console.log(`  ${d.code} ${d.name} → id=${d.id}`);
  return d?.id;
}

// ── 1000 経常資産 ──
console.log("\n=== 経常資産 ===");
const a1000 = await acct({ code: "1000", name: "経常資産", account_type: "asset" });

const a1100 = await acct({ code: "1100", name: "現金・電子マネー", account_type: "asset", parent_account_id: a1000 });
const a1110 = await acct({ code: "1110", name: "現金", account_type: "asset", parent_account_id: a1100 });
await acct({ code: "1120", name: "モバイルSUICA", account_type: "asset", parent_account_id: a1100 });
await acct({ code: "1130", name: "PAYPAY", account_type: "asset", parent_account_id: a1100 });
await acct({ code: "1140", name: "PASMO", account_type: "asset", parent_account_id: a1100 });

const a1200 = await acct({ code: "1200", name: "預金", account_type: "asset", parent_account_id: a1000 });
const a1210 = await acct({ code: "1210", name: "八十二銀行", account_type: "asset", parent_account_id: a1200 });
await acct({ code: "1220", name: "JRE銀行", account_type: "asset", parent_account_id: a1200 });

await acct({ code: "1300", name: "立替金", account_type: "asset", parent_account_id: a1000 });

const a1400 = await acct({ code: "1400", name: "預け金・プリペイド", account_type: "asset", parent_account_id: a1000 });
await acct({ code: "1410", name: "スターバックスカード", account_type: "asset", parent_account_id: a1400 });
await acct({ code: "1420", name: "立石プリカ", account_type: "asset", parent_account_id: a1400 });

await acct({ code: "1450", name: "前払費用", account_type: "asset", parent_account_id: a1000 });

// ── 1500 特別資産 ──
console.log("\n=== 特別資産 ===");
const a1500 = await acct({ code: "1500", name: "特別資産", account_type: "asset" });

const a1510 = await acct({ code: "1510", name: "預金", account_type: "asset", parent_account_id: a1500 });
await acct({ code: "1511", name: "三菱UFJ", account_type: "asset", parent_account_id: a1510 });
await acct({ code: "1512", name: "ゆうちょ銀行", account_type: "asset", parent_account_id: a1510 });
await acct({ code: "1513", name: "楽天銀行", account_type: "asset", parent_account_id: a1510 });
await acct({ code: "1514", name: "三井住友", account_type: "asset", parent_account_id: a1510 });

const a1520 = await acct({ code: "1520", name: "保証金・預け金", account_type: "asset", parent_account_id: a1500 });
await acct({ code: "1521", name: "施設デポジット", account_type: "asset", parent_account_id: a1520 });
await acct({ code: "1522", name: "個人預け金", account_type: "asset", parent_account_id: a1520 });

// ── 2000 経常負債 ──
console.log("\n=== 経常負債 ===");
const a2000 = await acct({ code: "2000", name: "経常負債", account_type: "liability" });

const a2100 = await acct({ code: "2100", name: "クレジット", account_type: "liability", parent_account_id: a2000 });
const a2110 = await acct({ code: "2110", name: "SUICA VIEW CARD", account_type: "liability", parent_account_id: a2100 });
await acct({ code: "2120", name: "楽天 MASTERCARD", account_type: "liability", parent_account_id: a2100 });
await acct({ code: "2130", name: "楽天 JCB", account_type: "liability", parent_account_id: a2100 });
await acct({ code: "2140", name: "三井住友カード", account_type: "liability", parent_account_id: a2100 });
await acct({ code: "2150", name: "メルカード", account_type: "liability", parent_account_id: a2100 });
await acct({ code: "2160", name: "ヨドバシ", account_type: "liability", parent_account_id: a2100 });

await acct({ code: "2200", name: "未払費用", account_type: "liability", parent_account_id: a2000 });

// ── 2500 特別負債 ──
console.log("\n=== 特別負債 ===");
const a2500 = await acct({ code: "2500", name: "特別負債", account_type: "liability" });
await acct({ code: "2510", name: "公的ローン", account_type: "liability", parent_account_id: a2500 });

const a2520 = await acct({ code: "2520", name: "私的ローン", account_type: "liability", parent_account_id: a2500 });
await acct({ code: "2521", name: "CPA学費ローン", account_type: "liability", parent_account_id: a2520 });
await acct({ code: "2522", name: "矯正歯科ローン", account_type: "liability", parent_account_id: a2520 });

// ── 3000 純資産 ──
console.log("\n=== 純資産 ===");
const a3000 = await acct({ code: "3000", name: "純資産", account_type: "equity" });
await acct({ code: "3100", name: "資本仮勘定", account_type: "equity", parent_account_id: a3000 });

// ── 4000 経常収益 ──
console.log("\n=== 経常収益 ===");
const a4000 = await acct({ code: "4000", name: "経常収益", account_type: "revenue" });
const a4100 = await acct({ code: "4100", name: "基本給", account_type: "revenue", parent_account_id: a4000 });
await acct({ code: "4110", name: "残業手当", account_type: "revenue", parent_account_id: a4000 });
await acct({ code: "4120", name: "通勤手当", account_type: "revenue", parent_account_id: a4000 });
await acct({ code: "4130", name: "その他手当", account_type: "revenue", parent_account_id: a4000 });

// ── 4500 特別収益 ──
console.log("\n=== 特別収益 ===");
const a4500 = await acct({ code: "4500", name: "特別収益", account_type: "revenue" });
await acct({ code: "4510", name: "賞与", account_type: "revenue", parent_account_id: a4500 });
await acct({ code: "4520", name: "雑収入", account_type: "revenue", parent_account_id: a4500 });

// ── 5000 経常費用 ──
console.log("\n=== 経常費用 ===");
const a5000 = await acct({ code: "5000", name: "経常費用", account_type: "expense" });

const a5100 = await acct({ code: "5100", name: "物品", account_type: "expense", parent_account_id: a5000 });
const a5110 = await acct({ code: "5110", name: "短期食糧", account_type: "expense", parent_account_id: a5100 });
await acct({ code: "5120", name: "長期食糧", account_type: "expense", parent_account_id: a5100 });
await acct({ code: "5130", name: "日用品", account_type: "expense", parent_account_id: a5100 });
await acct({ code: "5140", name: "被服費", account_type: "expense", parent_account_id: a5100 });
await acct({ code: "5150", name: "ガソリン", account_type: "expense", parent_account_id: a5100 });

const a5200 = await acct({ code: "5200", name: "権利", account_type: "expense", parent_account_id: a5000 });
await acct({ code: "5210", name: "車両保険", account_type: "expense", parent_account_id: a5200 });
await acct({ code: "5220", name: "火災保険", account_type: "expense", parent_account_id: a5200 });
await acct({ code: "5230", name: "教育・学習費", account_type: "expense", parent_account_id: a5200 });

const a5300 = await acct({ code: "5300", name: "サービス", account_type: "expense", parent_account_id: a5000 });
await acct({ code: "5310", name: "家賃", account_type: "expense", parent_account_id: a5300 });
await acct({ code: "5320", name: "電気", account_type: "expense", parent_account_id: a5300 });
await acct({ code: "5330", name: "水道", account_type: "expense", parent_account_id: a5300 });
await acct({ code: "5340", name: "ガス", account_type: "expense", parent_account_id: a5300 });
await acct({ code: "5350", name: "モバイル通信", account_type: "expense", parent_account_id: a5300 });
await acct({ code: "5360", name: "固定回線", account_type: "expense", parent_account_id: a5300 });
const a5370 = await acct({ code: "5370", name: "外食費", account_type: "expense", parent_account_id: a5300 });
await acct({ code: "5380", name: "交通費", account_type: "expense", parent_account_id: a5300 });
await acct({ code: "5385", name: "駐車場代", account_type: "expense", parent_account_id: a5300 });
await acct({ code: "5390", name: "交際費", account_type: "expense", parent_account_id: a5300 });
await acct({ code: "5391", name: "嗜好娯楽費", account_type: "expense", parent_account_id: a5300 });
await acct({ code: "5392", name: "医療費", account_type: "expense", parent_account_id: a5300 });
await acct({ code: "5393", name: "業務関連費", account_type: "expense", parent_account_id: a5300 });
await acct({ code: "5394", name: "生活維持費", account_type: "expense", parent_account_id: a5300 });
await acct({ code: "5395", name: "家族関連費", account_type: "expense", parent_account_id: a5300 });
await acct({ code: "5396", name: "情報サービス", account_type: "expense", parent_account_id: a5300 });
await acct({ code: "5397", name: "美容費", account_type: "expense", parent_account_id: a5300 });

const a5400 = await acct({ code: "5400", name: "公課", account_type: "expense", parent_account_id: a5000 });
const a5410 = await acct({ code: "5410", name: "税金費用", account_type: "expense", parent_account_id: a5400 });
await acct({ code: "5411", name: "所得税", account_type: "expense", parent_account_id: a5410 });
await acct({ code: "5412", name: "住民税", account_type: "expense", parent_account_id: a5410 });

const a5420 = await acct({ code: "5420", name: "社会保険料", account_type: "expense", parent_account_id: a5400 });
await acct({ code: "5421", name: "健康保険料", account_type: "expense", parent_account_id: a5420 });
await acct({ code: "5422", name: "厚生年金保険料", account_type: "expense", parent_account_id: a5420 });
await acct({ code: "5423", name: "雇用保険料", account_type: "expense", parent_account_id: a5420 });

// ── 5500 特別費用 ──
console.log("\n=== 特別費用 ===");
const a5500 = await acct({ code: "5500", name: "特別費用", account_type: "expense" });
await acct({ code: "5510", name: "雑損", account_type: "expense", parent_account_id: a5500 });

// ============================================================
// 6. Sample vouchers
// ============================================================

if (!catNormal || !dept || !cp || !proj || !a1210 || !a4100 || !a5370 || !a1110) {
  console.log("\nSkipping sample vouchers (missing prerequisite IDs)");
} else {
  console.log("\n=== サンプル伝票 ===");

  // Voucher 1: 給与受取
  const v1 = await post("/vouchers", {
    idempotency_key: "seed-salary-202504",
    voucher_code: "V202504-001",
    description: "4月分給与",
    journals: [{
      book_id: BOOK_ID,
      posted_at: "2025-04-25T00:00:00Z",
      journal_type_id: catNormal.id,
      project_id: proj.id,
      description: "4月分給与振込",
      lines: [
        { sort_order: 1, side: "debit", account_id: a1210, department_id: dept.id, counterparty_id: cp.id, amount: 250000 },
        { sort_order: 2, side: "credit", account_id: a4100, department_id: dept.id, counterparty_id: cp.id, amount: 250000 },
      ],
      tags: [tagSalary.id],
    }],
  });
  if (v1) console.log(`  V202504-001 給与受取 → id=${v1.id}`);

  // Voucher 2: 外食
  const v2 = await post("/vouchers", {
    idempotency_key: "seed-lunch-202504",
    voucher_code: "V202504-002",
    description: "昼食",
    journals: [{
      book_id: BOOK_ID,
      posted_at: "2025-04-26T12:00:00Z",
      journal_type_id: catNormal.id,
      project_id: proj.id,
      description: "外食",
      lines: [
        { sort_order: 1, side: "debit", account_id: a5370, department_id: dept.id, counterparty_id: cp.id, amount: 850 },
        { sort_order: 2, side: "credit", account_id: a1110, department_id: dept.id, counterparty_id: cp.id, amount: 850 },
      ],
      tags: [tagVariable.id],
    }],
  });
  if (v2) console.log(`  V202504-002 昼食 → id=${v2.id}`);
}

console.log("\nDone!");
