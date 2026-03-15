/**
 * Seed accounting book accounts via API (chart-of-accounts.md の accounting 部分).
 * Book "general" (一般帳簿, id=100000000000) は bootstrap で作成済み.
 * Usage: node dev/seed-accounting.mjs
 *
 * Requires PLATFORM_API_KEY in .env
 */

import "dotenv/config";

const BASE = process.env.BASE_URL || "http://localhost:3000";
const API = `${BASE}/api/v1`;
const TOKEN = process.env.PLATFORM_API_KEY;
if (!TOKEN) { console.error("PLATFORM_API_KEY is not set"); process.exit(1); }

const BOOK_ID = 100000000000; // bootstrap general book

async function acct(body) {
  const res = await fetch(`${API}/books/${BOOK_ID}/accounts`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) { console.error(`  FAIL: ${body.code} ${JSON.stringify(data)}`); return null; }
  console.log(`  ${data.data.code} ${data.data.name} → id=${data.data.id}`);
  return data.data.id;
}

async function main() {

  // NOTE: bootstrap で作成済みの既存勘定 (100, 101, 102, ... etc) は
  // 既に存在するのでスキップ or エラーになる.
  // ここでは chart-of-accounts.md の accounting book に記載された
  // 追加の勘定科目のみを投入する.

  // ── 1000 経常資産 ──
  console.log("=== 経常資産 ===");
  const a1000 = await acct({ code: "1000", name: "経常資産", account_type: "asset" });

  const a1100 = await acct({ code: "1100", name: "現金・電子マネー", account_type: "asset", parent_account_id: a1000 });
  await acct({ code: "1110", name: "現金",         account_type: "asset", parent_account_id: a1100 });
  await acct({ code: "1120", name: "モバイルSUICA", account_type: "asset", parent_account_id: a1100 });
  await acct({ code: "1130", name: "PAYPAY",       account_type: "asset", parent_account_id: a1100 });
  await acct({ code: "1140", name: "PASMO",        account_type: "asset", parent_account_id: a1100 });

  const a1200 = await acct({ code: "1200", name: "預金", account_type: "asset", parent_account_id: a1000 });
  await acct({ code: "1210", name: "八十二銀行", account_type: "asset", parent_account_id: a1200 });
  await acct({ code: "1220", name: "JRE銀行",   account_type: "asset", parent_account_id: a1200 });

  await acct({ code: "1300", name: "立替金", account_type: "asset", parent_account_id: a1000 });

  const a1400 = await acct({ code: "1400", name: "預け金・プリペイド", account_type: "asset", parent_account_id: a1000 });
  await acct({ code: "1410", name: "スターバックスカード", account_type: "asset", parent_account_id: a1400 });
  await acct({ code: "1420", name: "立石プリカ",         account_type: "asset", parent_account_id: a1400 });

  await acct({ code: "1450", name: "前払費用", account_type: "asset", parent_account_id: a1000 });

  // ── 1500 特別資産 ──
  console.log("\n=== 特別資産 ===");
  const a1500 = await acct({ code: "1500", name: "特別資産", account_type: "asset" });

  const a1510 = await acct({ code: "1510", name: "預金", account_type: "asset", parent_account_id: a1500 });
  await acct({ code: "1511", name: "三菱UFJ",     account_type: "asset", parent_account_id: a1510 });
  await acct({ code: "1512", name: "ゆうちょ銀行", account_type: "asset", parent_account_id: a1510 });
  await acct({ code: "1513", name: "楽天銀行",     account_type: "asset", parent_account_id: a1510 });
  await acct({ code: "1514", name: "三井住友",     account_type: "asset", parent_account_id: a1510 });

  const a1520 = await acct({ code: "1520", name: "保証金・預け金", account_type: "asset", parent_account_id: a1500 });
  await acct({ code: "1521", name: "施設デポジット", account_type: "asset", parent_account_id: a1520 });
  await acct({ code: "1522", name: "個人預け金",     account_type: "asset", parent_account_id: a1520 });

  // ── 2000 経常負債 ──
  console.log("\n=== 経常負債 ===");
  const a2000 = await acct({ code: "2000", name: "経常負債", account_type: "liability" });

  const a2100 = await acct({ code: "2100", name: "クレジット", account_type: "liability", parent_account_id: a2000 });
  await acct({ code: "2110", name: "SUICA VIEW CARD", account_type: "liability", parent_account_id: a2100 });
  await acct({ code: "2120", name: "楽天 MASTERCARD", account_type: "liability", parent_account_id: a2100 });
  await acct({ code: "2130", name: "楽天 JCB",        account_type: "liability", parent_account_id: a2100 });
  await acct({ code: "2140", name: "三井住友カード",   account_type: "liability", parent_account_id: a2100 });
  await acct({ code: "2150", name: "メルカード",       account_type: "liability", parent_account_id: a2100 });
  await acct({ code: "2160", name: "ヨドバシ",         account_type: "liability", parent_account_id: a2100 });

  await acct({ code: "2200", name: "未払費用", account_type: "liability", parent_account_id: a2000 });

  // ── 2500 特別負債 ──
  console.log("\n=== 特別負債 ===");
  const a2500 = await acct({ code: "2500", name: "特別負債", account_type: "liability" });
  await acct({ code: "2510", name: "公的ローン", account_type: "liability", parent_account_id: a2500 });

  const a2520 = await acct({ code: "2520", name: "私的ローン", account_type: "liability", parent_account_id: a2500 });
  await acct({ code: "2521", name: "CPA学費ローン",   account_type: "liability", parent_account_id: a2520 });
  await acct({ code: "2522", name: "矯正歯科ローン", account_type: "liability", parent_account_id: a2520 });

  // ── 3000 純資産 ──
  console.log("\n=== 純資産 ===");
  const a3000 = await acct({ code: "3000", name: "純資産", account_type: "equity" });
  await acct({ code: "3100", name: "資本仮勘定", account_type: "equity", parent_account_id: a3000 });

  // ── 4000 経常収益 ──
  console.log("\n=== 経常収益 ===");
  const a4000 = await acct({ code: "4000", name: "経常収益", account_type: "revenue" });
  await acct({ code: "4100", name: "基本給",     account_type: "revenue", parent_account_id: a4000 });
  await acct({ code: "4110", name: "残業手当",   account_type: "revenue", parent_account_id: a4000 });
  await acct({ code: "4120", name: "通勤手当",   account_type: "revenue", parent_account_id: a4000 });
  await acct({ code: "4130", name: "その他手当", account_type: "revenue", parent_account_id: a4000 });

  // ── 4500 特別収益 ──
  console.log("\n=== 特別収益 ===");
  const a4500 = await acct({ code: "4500", name: "特別収益", account_type: "revenue" });
  await acct({ code: "4510", name: "賞与",   account_type: "revenue", parent_account_id: a4500 });
  await acct({ code: "4520", name: "雑収入", account_type: "revenue", parent_account_id: a4500 });

  // ── 5000 経常費用 ──
  console.log("\n=== 経常費用 ===");
  const a5000 = await acct({ code: "5000", name: "経常費用", account_type: "expense" });

  const a5100 = await acct({ code: "5100", name: "物品", account_type: "expense", parent_account_id: a5000 });
  await acct({ code: "5110", name: "短期食糧", account_type: "expense", parent_account_id: a5100 });
  await acct({ code: "5120", name: "長期食糧", account_type: "expense", parent_account_id: a5100 });
  await acct({ code: "5130", name: "日用品",   account_type: "expense", parent_account_id: a5100 });
  await acct({ code: "5140", name: "被服費",   account_type: "expense", parent_account_id: a5100 });
  await acct({ code: "5150", name: "ガソリン", account_type: "expense", parent_account_id: a5100 });

  const a5200 = await acct({ code: "5200", name: "権利", account_type: "expense", parent_account_id: a5000 });
  await acct({ code: "5210", name: "車両保険",     account_type: "expense", parent_account_id: a5200 });
  await acct({ code: "5220", name: "火災保険",     account_type: "expense", parent_account_id: a5200 });
  await acct({ code: "5230", name: "教育・学習費", account_type: "expense", parent_account_id: a5200 });

  const a5300 = await acct({ code: "5300", name: "サービス", account_type: "expense", parent_account_id: a5000 });
  await acct({ code: "5310", name: "家賃",         account_type: "expense", parent_account_id: a5300 });
  await acct({ code: "5320", name: "電気",         account_type: "expense", parent_account_id: a5300 });
  await acct({ code: "5330", name: "水道",         account_type: "expense", parent_account_id: a5300 });
  await acct({ code: "5340", name: "ガス",         account_type: "expense", parent_account_id: a5300 });
  await acct({ code: "5350", name: "モバイル通信", account_type: "expense", parent_account_id: a5300 });
  await acct({ code: "5360", name: "固定回線",     account_type: "expense", parent_account_id: a5300 });
  await acct({ code: "5370", name: "外食費",       account_type: "expense", parent_account_id: a5300 });
  await acct({ code: "5380", name: "交通費",       account_type: "expense", parent_account_id: a5300 });
  await acct({ code: "5385", name: "駐車場代",     account_type: "expense", parent_account_id: a5300 });
  await acct({ code: "5390", name: "交際費",       account_type: "expense", parent_account_id: a5300 });
  await acct({ code: "5391", name: "嗜好娯楽費",   account_type: "expense", parent_account_id: a5300 });
  await acct({ code: "5392", name: "医療費",       account_type: "expense", parent_account_id: a5300 });
  await acct({ code: "5393", name: "業務関連費",   account_type: "expense", parent_account_id: a5300 });
  await acct({ code: "5394", name: "生活維持費",   account_type: "expense", parent_account_id: a5300 });
  await acct({ code: "5395", name: "家族関連費",   account_type: "expense", parent_account_id: a5300 });
  await acct({ code: "5396", name: "情報サービス", account_type: "expense", parent_account_id: a5300 });
  await acct({ code: "5397", name: "美容費",       account_type: "expense", parent_account_id: a5300 });

  const a5400 = await acct({ code: "5400", name: "公課", account_type: "expense", parent_account_id: a5000 });
  const a5410 = await acct({ code: "5410", name: "税金費用", account_type: "expense", parent_account_id: a5400 });
  await acct({ code: "5411", name: "所得税", account_type: "expense", parent_account_id: a5410 });
  await acct({ code: "5412", name: "住民税", account_type: "expense", parent_account_id: a5410 });

  const a5420 = await acct({ code: "5420", name: "社会保険料", account_type: "expense", parent_account_id: a5400 });
  await acct({ code: "5421", name: "健康保険料",     account_type: "expense", parent_account_id: a5420 });
  await acct({ code: "5422", name: "厚生年金保険料", account_type: "expense", parent_account_id: a5420 });
  await acct({ code: "5423", name: "雇用保険料",     account_type: "expense", parent_account_id: a5420 });

  // ── 5500 特別費用 ──
  console.log("\n=== 特別費用 ===");
  const a5500 = await acct({ code: "5500", name: "特別費用", account_type: "expense" });
  await acct({ code: "5510", name: "雑損", account_type: "expense", parent_account_id: a5500 });

  console.log("\nDone!");
}

main().catch(console.error);
