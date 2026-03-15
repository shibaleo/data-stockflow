# 勘定科目見直し — 進捗メモ

## 方針（更新: 2026-03-14）

Zaim アカウントを作り直し、**デフォルトカテゴリ/ジャンルのみ**で記帳する。
stockflow 側の account-mapping でデフォルトカテゴリ → 勘定科目に変換する。

### 理由
- 無料会員ではカスタムカテゴリの追加・編集不可（既存は使える）
- アカウント作り直し時にカスタムカテゴリは消える
- デフォルトのみにしておけば、将来アカウントを再作成しても同じ ID でマッピングが再利用可能

### Zaim の制約（判明事項）
- income には item 名（適用）を設定できない
- income を transfer に変更できない
- 無料会員でもカスタムカテゴリは「使い続けられる」が追加・編集は不可
- `parent_category_id = 0` / `parent_genre_id = 0` がカスタムの判別フラグ
- 口座（account）は無料会員でも自由に作成可能

---

## Zaim デフォルトカテゴリ一覧

### income（6カテゴリ、genre なし）

| id | name | → 勘定科目 |
|----|------|-----------|
| 11 | Salary | 4100 給与 |
| 12 | Advances repayment | （使わない or 3100 元入金） |
| 13 | Bonus | 4510 賞与 |
| 14 | Extraordinary revenue | 4500 特別収益 |
| 15 | Business income | 4530 受取利息 |
| 19 | Other | 4520 雑収入 |

通勤手当（4120）・残業手当（4110）のマッピング: → comment で分岐 or 給与に統合（要決定）

### payment（15カテゴリ）

| id | name | デフォルト genre |
|----|------|-----------------|
| 101 | Food | Grocery, Cafe, Breakfast, Lunch, Dinner, Eatery, Other |
| 102 | Daily goods | Consumables, Children, Pet, Tobacco, Necessities, Other |
| 103 | Transport | Train, Taxi, Bus, Airfares, Other |
| 104 | Phone, Net | Mobile, Fixed-line, Internet, TV license, Delivery, Postcard, Other |
| 105 | Utilities | Water, Electricity, Gas, Other |
| 106 | Home | Rent, Mortgage, Furniture, Renovation, Insurance, Other |
| 107 | Socializing | Party, Gift, Partner, Ceremonial, Other |
| 108 | Hobbies | Leisure, Movies, Music, Books, Games, Snacks, Cafe, Eatery, Clothes, Cartoon, Other |
| 109 | Education | Books, Tuition, Examination, Cram school, Newspapers, Insurance, Other |
| 110 | Medical | Hospital, Prescription, Transport, Insurance, Other |
| 111 | Fashion | Clothes, Accessories, Underwear, Cosmetics, Beauty salon, Esthetic, Other |
| 112 | Automobile | Gasoline, Parking, Insurance, Tax, Loan, Accreditation, Tolls, Other |
| 113 | Taxes | Income tax, Consumption tax, Residence tax, Property tax, Car insurance, Other |
| 114 | Big outlay | Travel, House, Car, Bike, Marriage, Birth, Nursing, Furniture, Electronics, Other |
| 199 | Other | Allowance, Pocket money, Unaccounted, Advances paid, Uncategorized, Debit cash/card, Other |

---

## 収益科目構造（確定）

```
4000 経常収益
  4100 給与
  4110 残業手当（新設 — 分離方法は要決定）
  4120 通勤手当

4500 特別収益
  4510 賞与
  4520 雑収入
  4530 受取利息（新設）
```

分類基準:
- 経常 = 3ヶ月以内の頻度で発生
- 特別 = 3ヶ月超の頻度

### 未決定事項
- 残業手当の分離方法（comment 分岐 or 給与に統合）
- 通勤手当のマッピング（デフォルトカテゴリにないので comment 分岐 or Salary に統合）

---

## 勘定科目の粒度設計（確定: 2026-03-14）

### 原則

- **勘定科目（仕訳行）が金額追跡の最小単位**
  - 例: 給与明細 → 所得税・住民税・健康保険料はそれぞれ別の仕訳行・別の勘定科目
- **タグは直交する多次元分析用**
  - 金額の集計単位ではなく、仕訳行に横断的に付与するラベル
  - Zaim のタグ機能とも対応可能

### is_leaf（末端科目フラグ）

account テーブルに `is_leaf: boolean` を追加。

| is_leaf | 意味 | 記帳 |
|---------|------|------|
| true | 末端科目 | 可（仕訳行で指定可能） |
| false | 集約科目（子を持つ） | 不可（仕訳バリデーションで拒否） |

### フィラー自動生成

末端科目に初めて子を作成した場合、以下をトランザクション内で自動実行:

1. 親の新リビジョンを INSERT（`is_leaf = false`）
2. フィラー子「{親の名前}（その他）」を INSERT（`is_leaf = true`）
3. 既存仕訳行の `account_code` を親 → フィラーに付け替え

これにより、既存データの整合性を維持しつつ親を集約専用に切り替える。

### レイヤー

- `is_leaf` は **Atomic API 内部のドメインロジック** として管理
- API からの直接操作は不可（create/update スキーマに `is_leaf` フィールドなし）
- 勘定科目作成時に親子関係に基づき自動で計算・遷移

### 実装済みファイル

- `prisma/schema.prisma` — `is_leaf` カラム追加
- `prisma/migrations/20260314000000_add_account_is_leaf/` — マイグレーション（既存データ計算含む）
- `src/lib/types.ts` — `CurrentAccount` に `is_leaf` 追加
- `src/lib/validators.ts` — `accountResponseSchema` に `is_leaf` 追加（レスポンスのみ）
- `src/routes/accounts.ts` — フィラー自動生成ロジック、update/deactivate/restore で `is_leaf` 保持
- `src/routes/journals.ts` — 仕訳作成・更新時に `is_leaf = true` バリデーション

---

## 費用科目構造 — 未着手

デフォルト payment カテゴリ/ジャンル → 勘定科目のマッピング表を設計する。

---

## 全体 TODO

### Zaim 再構築
- [ ] デフォルトカテゴリ/ジャンル → 勘定科目マッピング表を完成させる
- [ ] 費用科目の勘定科目構造を設計する
- [ ] 収益: 残業手当・通勤手当の扱いを決定
- [ ] Zaim アカウント作り直し
- [ ] デフォルトカテゴリで全取引を再入力
- [ ] stockflow に account-mapping をシード投入

### Atomic API / ドメインロジック
- [x] is_leaf 設計・実装（マイグレーション、フィラー自動生成、仕訳バリデーション）
- [ ] 閉鎖済期間の記帳拒否（journals POST/PUT で status=closed 拒否）
- [ ] Zaim → journal 変換パイプライン実装

### Operations API（開発中止 — Atomic とドメインロジック優先）
- [ ] レポート API（試算表・総勘定元帳・仕訳帳）
- [ ] 一括仕訳 API（POST /api/ops/v1/journals/batch）
