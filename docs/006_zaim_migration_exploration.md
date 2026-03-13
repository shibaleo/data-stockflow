# 006: Zaim トランザクション移行 — 調査・方針メモ

## 概要

`data_warehouse.data_presentation.fct_zaim_transactions` のデータを
data-stockflow の仕訳（journal / journal_line）として移行する方針の模索記録。

## データソース

- テーブル: `data_presentation.fct_zaim_transactions`
- レコード数: 2,868件（2025-03-20 〜 2026-03-13）
- モード別内訳: payment 2,601 / transfer 212 / income 55

## Zaim データ構造

| カラム | 内容 |
|--------|------|
| mode | payment / income / transfer |
| category / genre | 費目分類（payment/income 時） |
| from_account_name | 支出元 / 振替元 |
| to_account_name | 入金先 / 振替先 |
| amount | 金額（常に正） |
| date | 取引日 |
| comment | 摘要 |

## Zaim アカウント一覧（34種）

プレフィックスで分類:

| Prefix | 意味 | 例 |
|--------|------|-----|
| BK_ | 銀行口座 | BK_82, BK_MUFG, BK_JRE |
| CC_ | クレジットカード | CC_VIEW, CC_RAKUTEN |
| CY_ | 電子マネー | CY_MOBILE_SUICA, CY_PAYPAY |
| AD_ | 自動引落（中間） | AD_Electricity, AD_Gas, AD_Water |
| PD_ | ポイント・デビット | PD_D_POINT, PD_RAKUTEN_POINT |
| DP_ | 預金・デポジット | DP_TOSHIN, DP_CRYPTO |
| LN_ | ローン | LN_SCHOLARSHIP |
| CD_ | 現金 | CD_CASH |

### AD_* / PD_* の位置付け

Zaim では「CC_VIEW → AD_Electricity」「AD_Electricity → (電気代)」のように
中間アカウントを経由する振替パターンがある。
実態は CC_VIEW から電気代が引き落とされている。

## 仕訳変換ルール

### payment（支出）

```
借方: 費用科目（category/genre でマッピング）
貸方: 支払元アカウント（from_account でマッピング）
```

例: 食費/スーパー, from=CY_MOBILE_SUICA, ¥1,000
→ 借方: 0511 短期食糧 ¥1,000 / 貸方: 0121 モバイルSUICA ¥1,000

### income（収入）

```
借方: 入金先アカウント（to_account でマッピング）
貸方: 収益科目（category でマッピング）
```

例: 給与, to=BK_82, ¥300,000
→ 借方: (BK_82の資産科目) ¥300,000 / 貸方: 0400 収益 ¥300,000

### transfer（振替）

```
借方: 移動先アカウント（to_account でマッピング）
貸方: 移動元アカウント（from_account でマッピング）
```

例: BK_82 → BK_MUFG, ¥50,000
→ 借方: (MUFG資産科目) ¥50,000 / 貸方: (82資産科目) ¥50,000

## マッピング方針

ユーザーが定義した原則:

| Zaim上の性質 | 会計上の分類 |
|-------------|-------------|
| payment のカテゴリ/ジャンル | 費用科目 |
| income のカテゴリ | 収益科目 |
| 残高 ≥ 0 のアカウント | 資産 |
| 残高 < 0 のアカウント | 負債 |
| 資産 − 負債 の差額 | 純資産 |

### 既存勘定科目との対応（暫定）

**資産**

| Zaim アカウント | 勘定科目 |
|----------------|---------|
| CD_CASH | 0110 現金 |
| CY_MOBILE_SUICA | 0121 モバイルSUICA |
| CY_PAYPAY | 0122 PAYPAY |
| BK_82, BK_MUFG, BK_JRE | 要作成（銀行口座） |
| DP_TOSHIN, DP_CRYPTO | 要作成（投資・暗号資産） |

**負債**

| Zaim アカウント | 勘定科目 |
|----------------|---------|
| CC_VIEW | 0211 SUICA VIEW CARD |
| CC_RAKUTEN | 0212 楽天 MASTERCARD |
| LN_SCHOLARSHIP | 0250 公的ローン |

**費用（category/genre → 勘定科目）**

| カテゴリ | ジャンル例 | 勘定科目 |
|---------|-----------|---------|
| 食費 | スーパー・コンビニ等 | 0511 短期食糧 |
| 住宅 | 家賃 | 0531 家賃 |
| 水道・光熱 | 電気 | 0532 電気 |
| 水道・光熱 | 水道 | 0533 水道 |
| 水道・光熱 | ガス | 0534 ガス |
| 通信 | 携帯電話 | 0535 モバイル通信 |
| 交際費 | 外食 | 0537 外食費 |
| 保険 | 車両保険 | 0521 車両保険 |
| 保険 | 火災保険 | 0522 火災保険 |
| その他多数 | ... | 要マッピング定義 |

## AD_* / PD_* の扱い — 2案

### 案A: 中間科目として忠実に再現

- AD_*, PD_* を資産科目として作成
- Zaim の振替を忠実に2仕訳で記録
  - CC_VIEW → AD_Electricity（振替仕訳）
  - AD_Electricity → 電気代（費用仕訳）
- メリット: Zaim データとの完全な対応
- デメリット: 実態と乖離した中間科目が増える

### 案B: 中間科目をスキップ（簡略化）

- AD_* の振替を検出して、元の支払元（CC_VIEW）から直接費用計上
- 中間アカウントの振替仕訳を生成しない
- メリット: シンプル、実態に即した仕訳
- デメリット: Zaim の生データとの突合が複雑になる

### 主な振替パターン（上位）

| from → to | 件数 | 性質 |
|-----------|------|------|
| CC_VIEW → CY_MOBILE_SUICA | 43 | カードからチャージ |
| BK_JRE → CC_VIEW | 13 | 口座からカード引落 |
| BK_82 → BK_MUFG | 12 | 口座間移動 |
| CC_VIEW → AD_* | 多数 | 自動引落（中間経由） |

## 実装に使う既存テーブル

- `account_mapping`: category/genre → 勘定科目コード
- `payment_mapping`: Zaim payment_method → 勘定科目コード

## TODO

- [ ] AD_*/PD_* の方針確定（案A or 案B）
- [ ] 不足する勘定科目の作成（銀行口座、投資など）
- [ ] account_mapping / payment_mapping へのデータ投入
- [ ] 移行スクリプト作成（段階的に実行可能な設計）
- [ ] 移行後の残高検証
