# 勘定科目見直し — 進捗メモ

## 方針（更新: 2026-03-13）

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

### API / 機能
- [ ] Zaim → journal 変換パイプライン実装
- [ ] レポート API 充実（試算表・総勘定元帳・仕訳帳）
- [ ] 一括仕訳 API（POST /api/ops/v1/journals/batch）
- [ ] 閉鎖済期間の記帳拒否（journals POST/PUT で status=closed 拒否）
