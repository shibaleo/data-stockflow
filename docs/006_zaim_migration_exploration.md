# 006: Zaim トランザクション移行 — 調査・方針メモ

## 概要

`data_warehouse.data_presentation.fct_zaim_transactions` のデータを
data-stockflow の仕訳（journal / journal_line）として移行する方針の模索記録。

## データソース

- テーブル: `data_presentation.fct_zaim_transactions`
- レコード数: 2,868件（2025-03-20 〜 2026-03-13）
- モード別内訳: payment 2,601 / transfer 212 / income 55
- カラム: id, source_id, zaim_id, mode, transaction_date, amount, category_name, genre_name, from_account_name, to_account_name, item_name, place, comment, currency_code, created_at, synced_at

## Zaim アカウント体系

### プレフィックス定義

| Prefix | 正式名 | 意味 | 会計上の性質 |
|--------|--------|------|-------------|
| BK_ | Bank | 銀行口座 | 資産（普通預金） |
| CC_ | Credit Card | クレジットカード | 負債（未払金） |
| CY_ | Currency | 通貨・電子マネー | 資産（現金同等物） |
| CD_ | Credit/Debt | 個人的な貸し | 資産（貸付金・立替金） |
| DP_ | Deposit | 預け金・プリペイド | 資産（前払金・保証金） |
| AD_ | Auto Deduction | 自動引落（経過勘定） | 負債（未払費用） |
| PD_ | Periodic Deduction | 定期支払（経過勘定） | 資産（前払費用） |
| LN_ | Loan | ローン | 負債（借入金） |

## 勘定科目体系（確定版）

番号体系: 1=資産, 2=負債, 3=純資産, 4=収益, 5=費用
各区分を経常/特別に分離（純資産を除く）。

```
1000 経常資産
├── 1100 現金・電子マネー
│   ├── 1110 現金 (= CY_WALLET)
│   ├── 1120 モバイルSUICA (= CY_MOBILE_SUICA)
│   ├── 1130 PAYPAY (= CY_PAYPAY)
│   └── 1140 PASMO (= CY_PASUMO)
├── 1200 預金
│   ├── 1210 八十二銀行 (= BK_82)
│   └── 1220 JRE銀行 (= BK_JRE)
├── 1300 立替金 (= CD_PRIVATE)
├── 1400 預け金・プリペイド
│   ├── 1410 スターバックスカード (= DP_STARBUCKS)
│   └── 1420 立石プリカ (= DP_TATEISHI)
└── 1450 前払費用 (= PD_*)

1500 特別資産
├── 1510 預金
│   ├── 1511 三菱UFJ (= BK_MUFG)
│   ├── 1512 ゆうちょ銀行 (= BK_JP_POST)
│   ├── 1513 楽天銀行 (= BK_RAKUTEN)
│   └── 1514 三井住友 (= BK_SMBC)
└── 1520 保証金・預け金
    ├── 1521 施設デポジット (= DP_FACILITY)
    └── 1522 個人預け金 (= DP_PRIVATE)

2000 経常負債
├── 2100 クレジット
│   ├── 2110 SUICA VIEW CARD (= CC_VIEW)
│   ├── 2120 楽天 MASTERCARD (= CC_RAKUTEN_MASTERCARD)
│   ├── 2130 楽天 JCB (= CC_RAKUTEN_JCB)
│   ├── 2140 三井住友カード (= CC_AMAZON)
│   ├── 2150 メルカード (= CC_MER_CARD)
│   └── 2160 ヨドバシ (= CC_YODOBASHI)
└── 2200 未払費用 (= AD_*)

2500 特別負債
├── 2510 公的ローン (= LN_SCHOLARSHIP / LN_STUDENT)
└── 2520 私的ローン
    ├── 2521 CPA学費ローン (= LN_TUITION_CPA)
    └── 2522 矯正歯科ローン (= LN_ORTHODONTIST)

3000 純資産
└── 3100 資本仮勘定

4000 経常収益
├── 4100 給与
└── 4120 通勤手当

4500 特別収益
├── 4510 賞与
└── 4520 雑収入

5000 経常費用
├── 5100 物品
│   ├── 5110 短期食糧
│   ├── 5120 長期食糧
│   ├── 5130 日用品
│   ├── 5140 被服費
│   └── 5150 ガソリン
├── 5200 権利
│   ├── 5210 車両保険
│   ├── 5220 火災保険
│   └── 5230 教育・学習費
├── 5300 サービス
│   ├── 5310 家賃
│   ├── 5320 電気
│   ├── 5330 水道
│   ├── 5340 ガス
│   ├── 5350 モバイル通信
│   ├── 5360 固定回線
│   ├── 5370 外食費
│   ├── 5380 交通費
│   ├── 5385 駐車場代
│   ├── 5390 交際費
│   ├── 5391 嗜好娯楽費
│   ├── 5392 医療費
│   ├── 5393 業務関連費
│   ├── 5394 生活維持費
│   ├── 5395 家族関連費
│   ├── 5396 情報サービス
│   └── 5397 美容費
└── 5400 公課
    ├── 5410 租税公課
    └── 5420 社会保険料

5500 特別費用
└── 5510 雑損
```

### 費用の4分類

| 分類 | 定義 | 例 |
|------|------|-----|
| 物品 | 物理的なモノの購入 | 食糧、日用品、被服、ガソリン |
| 権利 | 権利・無形資産の取得 | 保険、教育、資格 |
| サービス | 役務の提供を受ける | 家賃、光熱費、交通、医療、外食 |
| 公課 | 法令に基づく強制的な負担 | 租税公課、社会保険料 |

### 分析軸の設計

勘定科目は「何に使ったか」の構造。他の分析軸は journal_line の属性で管理。

| 軸 | フィールド | 粒度 | 例 |
|----|-----------|------|-----|
| WHAT（何に） | account_code | 行単位 | 権利、物品、サービス |
| WHO（誰に） | counterparty_code | 行単位 | Anthropic、イオン |
| WHERE（どこが） | department_code | 行単位 | 営業部、開発部 |
| CONTEXT | journal_tag | 仕訳単位 | genre:Cafe、event:引越し |
| 詳細 | description | 行単位 | 自由記述 |

サービス単位の分析（例: Claude利用料の月別推移）は account × counterparty の掛け合わせで実現。
genre レベルの分析（例: 嗜好娯楽費のカフェ vs 間食の内訳）は account × tag で実現。
割り勘等で「誰といたか」は tag で管理（counterparty は支払先に限定）。

## タグマスタ設計（確定版）

tag テーブルの tag_type で分類。zaim 移行時に機械的に付与。手入力時は任意。
旧 category（zaim大分類）と genre（zaim小分類）は `label` に統合。会計システム側で区別する実益がないため。

### tag_type = "label"（分類ラベル・75件）

旧 zaim 大分類（FOOD, PLEASURE 等）と小分類（GROCERIES, STABLE_FOOD 等）をフラットに統合。

| display_code | name |
|---|---|
| FOOD | 食費 |
| PLEASURE | 嗜好 |
| CASUAL | 交際 |
| CLOSE | 親密 |
| TRANSPORT | 交通 |
| ITEMS | 物品 |
| INFRA | インフラ |
| OBLIGATION | 公課 |
| OVERHEAD | 間接費 |
| WORK | 仕事 |
| EDUCATION | 資格教育 |
| LEARNING | 趣味学習 |
| HEALTH | 健康 |
| MAINTENANCE | 維持管理 |
| OTHER | その他 |
| GROCERIES | 食料品 |
| STABLE_FOOD | 保存食 |
| HYGIENE | 衛生用品 |
| COSME | 化粧品 |
| KITCHEN | 台所用品 |
| TOILET | トイレ用品 |
| GADGETS | ガジェット |
| DINING_ITEMS | 食器 |
| CLOTHES | 衣類 |
| SHOES | 靴 |
| GASOLINE | ガソリン |
| CAR_INSURANCE | 車両保険 |
| FIRE_INSURANCE | 火災保険 |
| TUITION | 学費 |
| EDUCATION_BOOKS | 資格関連書籍 |
| EXAMINATION | 受験・試験 |
| LEARNING_BOOKS | 趣味の学習書 |
| PLEASURE_BOOKS | 娯楽本 |
| RENT | 家賃 |
| ELECTRICITY | 電気 |
| WATER | 水道 |
| GAS | ガス |
| PHONE | 通信 |
| EATERY | 外食 |
| TRAIN | 電車 |
| TOLLS | 高速代 |
| PARKING | 駐車場 |
| FRIENDS | 友人 |
| TEMPORARY | 一時的な付き合い |
| SNACKS | 間食 |
| CAFE | カフェ |
| SPA | 温泉・スパ |
| CARTOON | 漫画 |
| MASSAGE | マッサージ |
| LEISURE | レジャー |
| HOSPITAL | 病院 |
| MEDICINE | 薬 |
| ORTHODONTIA | 矯正歯科 |
| BEAUTY_SALON | 美容院 |
| BUSINESS_PARTY | 仕事の会食 |
| COWORKERS | 同僚 |
| LAUNDRY | 洗濯 |
| CAR_MAINT | 車両整備 |
| GARBAGE | ゴミ処理 |
| FATHER | 父 |
| MOTHER | 母 |
| SISTER | 姉妹 |
| BROTHER | 兄弟 |
| PARTNER | パートナー |
| RELATIVES | 親戚 |
| CONSOLE | コンソール |
| LLM | LLM |
| LOGISTICS | 物流 |
| FINANCE | 金融手数料 |
| INCOME_TAX | 所得税 |
| RESIDENCE_TAX | 住民税 |
| VEHICLE_TAX | 自動車税 |
| HEALTH_INS | 健康保険 |
| PENSION | 厚生年金 |
| EMPLOYMENT_INS | 雇用保険 |

### tag_type = "relationship"（人間関係、今後の手入力用）

| display_code | name |
|---|---|
| CLOSE_FRIEND | 親しい友人 |
| CASUAL_FRIEND | カジュアルな友人 |

### tag_type = "source"（データ出自の識別）

| display_code | name |
|---|---|
| ZAIM | Zaim移行データ |

## Zaim アカウント → 勘定科目マッピング

### BS科目（from_account / to_account → 勘定科目）

| Zaim account | 勘定科目 |
|-------------|---------|
| CY_WALLET | 1110 現金 |
| CY_MOBILE_SUICA | 1120 モバイルSUICA |
| CY_PAYPAY | 1130 PAYPAY |
| CY_PASUMO | 1140 PASMO |
| BK_82 | 1210 八十二銀行 |
| BK_JRE | 1220 JRE銀行 |
| CD_PRIVATE | 1300 立替金 |
| DP_STARBUCKS | 1410 スターバックスカード |
| DP_TATEISHI | 1420 立石プリカ |
| PD_* (全8種) | 1450 前払費用 |
| BK_MUFG | 1511 三菱UFJ |
| BK_JP_POST | 1512 ゆうちょ銀行 |
| BK_RAKUTEN | 1513 楽天銀行 |
| BK_SMBC | 1514 三井住友 |
| DP_FACILITY | 1521 施設デポジット |
| DP_PRIVATE | 1522 個人預け金 |
| CC_VIEW | 2110 SUICA VIEW CARD |
| CC_RAKUTEN_MASTERCARD | 2120 楽天 MASTERCARD |
| CC_RAKUTEN_JCB | 2130 楽天 JCB |
| CC_AMAZON | 2140 三井住友カード |
| CC_MER_CARD | 2150 メルカード |
| CC_YODOBASHI | 2160 ヨドバシ |
| AD_* (全4種) | 2200 未払費用 |
| LN_SCHOLARSHIP / LN_STUDENT | 2510 公的ローン |
| LN_TUITION_CPA | 2521 CPA学費ローン |
| LN_ORTHODONTIST | 2522 矯正歯科ローン |

## 費用科目マッピング（category_name/genre_name → 勘定科目 + タグ）

### 確定マッピング（72パターン）

| category | genre | 件数 | 金額 | → 勘定科目 | tags (label) |
|---|---|---|---|---|---|
| Food | Groceries | 1,215 | 242,362 | 5110 短期食糧 | FOOD, GROCERIES |
| Food | Stable | 42 | 17,606 | 5120 長期食糧 | FOOD, STABLE_FOOD |
| Food | Eatery | 1 | 630 | 5370 外食費 | FOOD, EATERY |
| Items | Hygiene | 64 | 35,130 | 5130 日用品 | ITEMS, HYGIENE |
| Items | Cosme | 34 | 24,603 | 5130 日用品 | ITEMS, COSME |
| Items | Kitchen | 34 | 14,240 | 5130 日用品 | ITEMS, KITCHEN |
| Items | Other | 22 | 11,942 | 5130 日用品 | ITEMS |
| Items | Gadgets | 17 | 60,951 | 5130 日用品 | ITEMS, GADGETS |
| Items | Toilet | 11 | 3,086 | 5130 日用品 | ITEMS, TOILET |
| Items | Dining | 4 | 3,414 | 5130 日用品 | ITEMS, DINING_ITEMS |
| Items | Clothes | 22 | 23,658 | 5140 被服費 | ITEMS, CLOTHES |
| Items | Shoes | 3 | 7,697 | 5140 被服費 | ITEMS, SHOES |
| Transport | Gasoline | 97 | 140,297 | 5150 ガソリン | TRANSPORT, GASOLINE |
| Infra | Car Insurance | 1 | 72,290 | 5210 車両保険 | INFRA, CAR_INSURANCE |
| Infra | Fire Insurance | 1 | 16,000 | 5220 火災保険 | INFRA, FIRE_INSURANCE |
| Education | Tuition | 10 | 548,625 | 5230 教育・学習費 | EDUCATION, TUITION |
| Education | Books | 6 | 17,926 | 5230 教育・学習費 | EDUCATION, EDUCATION_BOOKS |
| Education | Examination | 3 | 6,270 | 5230 教育・学習費 | EDUCATION, EXAMINATION |
| Education | Other | 1 | 7,700 | 5230 教育・学習費 | EDUCATION |
| Infra | Rent | 14 | 510,077 | 5310 家賃 | INFRA, RENT |
| Infra | Electricity | 4 | 19,859 | 5320 電気 | INFRA, ELECTRICITY |
| Infra | Water | 5 | 13,587 | 5330 水道 | INFRA, WATER |
| Infra | Gas | 3 | 11,538 | 5340 ガス | INFRA, GAS |
| Infra | Phone | 9 | 26,413 | 5350 モバイル通信 | INFRA, PHONE |
| Pleasure | Eatery | 110 | 80,415 | 5370 外食費 | PLEASURE, EATERY |
| Transport | Train | 53 | 76,156 | 5380 交通費 | TRANSPORT, TRAIN |
| Transport | Tolls | 9 | 15,540 | 5380 交通費 | TRANSPORT, TOLLS |
| Transport | Parking | 7 | 34,500 | 5385 駐車場代 | TRANSPORT, PARKING |
| Casual | Friends | 116 | 131,504 | 5390 交際費 | CASUAL, FRIENDS |
| Casual | Temporary | 53 | 90,496 | 5390 交際費 | CASUAL, TEMPORARY |
| Pleasure | Snacks | 249 | 42,392 | 5391 嗜好娯楽費 | PLEASURE, SNACKS |
| Pleasure | Cafe | 59 | 14,604 | 5391 嗜好娯楽費 | PLEASURE, CAFE |
| Pleasure | Spa | 14 | 7,700 | 5391 嗜好娯楽費 | PLEASURE, SPA |
| Pleasure | Other | 11 | 5,784 | 5391 嗜好娯楽費 | PLEASURE |
| Pleasure | Books | 5 | 2,492 | 5391 嗜好娯楽費 | PLEASURE, PLEASURE_BOOKS |
| Pleasure | Cartoon | 2 | 8,600 | 5391 嗜好娯楽費 | PLEASURE, CARTOON |
| Pleasure | Massage | 2 | 11,270 | 5391 嗜好娯楽費 | PLEASURE, MASSAGE |
| Pleasure | Leisure | 1 | 1,480 | 5391 嗜好娯楽費 | PLEASURE, LEISURE |
| Learning | Books | 7 | 8,363 | 5391 嗜好娯楽費 | LEARNING, LEARNING_BOOKS |
| Health | Hospital | 10 | 25,770 | 5392 医療費 | HEALTH, HOSPITAL |
| Health | Fee | 6 | 46,068 | 5392 医療費 | HEALTH |
| Health | Medicine | 3 | 2,150 | 5392 医療費 | HEALTH, MEDICINE |
| Health | Orthodontina | 3 | 62,700 | 5392 医療費 | HEALTH, ORTHODONTIA |
| Health | Initial | 1 | 5,500 | 5392 医療費 | HEALTH |
| Work | Business Party | 12 | 32,000 | 5393 業務関連費 | WORK, BUSINESS_PARTY |
| Work | Coworkers | 11 | 6,866 | 5393 業務関連費 | WORK, COWORKERS |
| Work | Clothes | 7 | 18,420 | 5393 業務関連費 | WORK, CLOTHES |
| Work | Shoes | 2 | 12,474 | 5393 業務関連費 | WORK, SHOES |
| Maintenance | Laundry | 65 | 48,299 | 5394 生活維持費 | MAINTENANCE, LAUNDRY |
| Maintenance | Car | 5 | 116,000 | 5394 生活維持費 | MAINTENANCE, CAR_MAINT |
| Maintenance | Gabage | 6 | 3,920 | 5394 生活維持費 | MAINTENANCE, GARBAGE |
| Close | Father | 16 | 26,778 | 5395 家族関連費 | CLOSE, FATHER |
| Close | Mother | 9 | 12,280 | 5395 家族関連費 | CLOSE, MOTHER |
| Close | Sister | 8 | 4,430 | 5395 家族関連費 | CLOSE, SISTER |
| Close | Partner | 7 | 8,712 | 5395 家族関連費 | CLOSE, PARTNER |
| Close | Relatives | 3 | 373 | 5395 家族関連費 | CLOSE, RELATIVES |
| Close | Brother | 1 | 2,000 | 5395 家族関連費 | CLOSE, BROTHER |
| Close | Other | 1 | 1,500 | 5395 家族関連費 | CLOSE |
| Overhead | Console | 12 | 19,800 | 5396 情報サービス | OVERHEAD, CONSOLE |
| Overhead | LLM | 8 | 99,408 | 5396 情報サービス | OVERHEAD, LLM |
| Overhead | logistics | 6 | 2,950 | 5396 情報サービス | OVERHEAD, LOGISTICS |
| Overhead | Other | 5 | 4,707 | 5396 情報サービス | OVERHEAD |
| Overhead | Finance | 1 | 4,378 | 5396 情報サービス | OVERHEAD, FINANCE |
| Health | Beauty Salon | 4 | 50,600 | 5397 美容費 | HEALTH, BEAUTY_SALON |
| Obligation | Income tax | 12 | 35,905 | 5410 租税公課 | OBLIGATION, INCOME_TAX |
| Obligation | Residence tax | 11 | 37,900 | 5410 租税公課 | OBLIGATION, RESIDENCE_TAX |
| Obligation | Vehicle tax | 1 | 14,900 | 5410 租税公課 | OBLIGATION, VEHICLE_TAX |
| Obligation | Other | 2 | 680 | 5410 租税公課 | OBLIGATION |
| Obligation | Health Insurance | 12 | 140,941 | 5420 社会保険料 | OBLIGATION, HEALTH_INS |
| Obligation | Pension | 12 | 266,173 | 5420 社会保険料 | OBLIGATION, PENSION |
| Obligation | Employment Insurance | 12 | 16,700 | 5420 社会保険料 | OBLIGATION, EMPLOYMENT_INS |
| Other | Other | 5 | 18,712 | ※item_name で判定 | OTHER |
| Other | Allowance | 1 | 100 | 4520 雑収入 | OTHER |

※ Other/Other (5件) は item_name の内容に応じて雑損(5510)または雑収入(4520)に振り分け。
※ Other/Allowance は収益（雑収入）として処理。

## 負数レコードの分析

zaim data に含まれる amount < 0 のレコード（約220件）。
すべて mode=payment で記録されており、**費用の減額**として処理する。
立替金（債権）として管理するより実態に即している。

### パターン1: 割引・値引き（188件, 合計 -20,913円）

| item_name | 件数 | 例 |
|---|---|---|
| 割引 | 188 | 綿半スーパーセンター、アポロステーション等 |
| 値引き / 値引 | 3 | 書籍、ガソリン |
| クーポン値引き | 1 | クスリのアオキ |
| 楽天ポイント利用 | 1 | 西友 |
| ▲シールWリ引 | 1 | 綿半 |

→ 同じ category/genre の費用減額。通常の payment と同じマッピングで符号反転するだけ。

### パターン2: 割り勘の回収（約20件, 合計 -約40,000円）

| item_name | category/genre | amount |
|---|---|---|
| 藤くんより受け取り | Casual/Friends | -1,000, -2,500 |
| はやせより受け取り | Casual/Friends | -1,000, -2,500 |
| 多田より受け取り | Pleasure/Eatery | -6,165 |
| 八宝苑宮川さんより | Work/Coworkers | -3,730 |
| 若林さんよりBlueline... | Casual/Friends | -1,650 |
| あやかさんなんか色々 | Casual/Temporary | -2,360 |
| さきさんより受け取り | Casual/Temporary | -1,480 |
| みなみさんより受取 | Casual/Temporary | -5,000 |
| 等... | | |

→ 費用の減額として処理。割り勘で誰かが自分の分を払ってくれた = その交際費が実質的に減少。
→ 立替金として管理するより実態に合っている（zaim上は回収済みのものだけ記録されている）。

### パターン3: 特殊ケース

| item_name | category | amount | 処理 |
|---|---|---|---|
| 所得税 | Obligation/Income tax | -27,393 | 年末調整還付 → 租税公課の減額 |
| Inconsistent (4件) | Food/Groceries | -3〜-1,086 | データ品質問題 → 後述 |
| (empty, transfer) | — | -1,450 | クレジット会社からの返金（正常） |

### 変換ルール

符号付金額モデルにおいて、負数レコードは通常の payment と**同じマッピングルール**を適用する。
amount が負のため、仕訳の借方/貸方が自動的に反転する。

| zaim | 仕訳（符号付） |
|---|---|
| payment +1,000 Food/Groceries from CY_WALLET | 借方 5110 -1,000 / 貸方 1110 +1,000 |
| payment -100 Food/Groceries from CY_WALLET "割引" | 借方 5110 +100 / 貸方 1110 -100 |
| payment -1,000 Casual/Friends from CY_WALLET "藤くんより受け取り" | 借方 5390 +1,000 / 貸方 1110 -1,000 |

→ マッピングロジックの分岐が不要。符号がそのまま会計的意味を持つ。

## 仕訳変換ルール

### payment（支出 + 費用減額）2,601件

```
借方: 費用科目（category_name/genre_name でマッピング）  amount = -zaim.amount
貸方: 支払元アカウント（from_account_name でマッピング） amount = +zaim.amount
タグ: category + genre（上記マッピング表に基づく）
タグ: source:ZAIM（移行データ識別用）
```

zaim.amount > 0 → 通常の費用計上（借方に費用増、貸方に資産減）
zaim.amount < 0 → 費用の減額（借方に費用減、貸方に資産増）
→ 同一ロジックで処理可能。分岐不要。

例: Food/Groceries, from=CY_MOBILE_SUICA, ¥1,000
→ 借方: 5110 短期食糧 -1,000 / 貸方: 1120 モバイルSUICA +1,000
→ tags: FOOD, GROCERIES, ZAIM

例: Food/Groceries, from=CC_VIEW, -¥200 "割引"
→ 借方: 5110 短期食糧 +200 / 貸方: 2110 SUICA VIEW CARD -200
→ tags: FOOD, GROCERIES, ZAIM

### income（収入）55件

```
借方: 入金先アカウント（to_account_name でマッピング）  amount = -zaim.amount
貸方: 収益科目（category_name でマッピング）            amount = +zaim.amount
タグ: source:ZAIM
```

例: Salary, to=BK_82, ¥300,000
→ 借方: 1210 八十二銀行 -300,000 / 貸方: 4100 給与 +300,000

### transfer（振替）212件

```
借方: 移動先アカウント（to_account_name でマッピング）  amount = -zaim.amount
貸方: 移動元アカウント（from_account_name でマッピング） amount = +zaim.amount
タグ: source:ZAIM
```

例: BK_82 → BK_MUFG, ¥50,000
→ 借方: 1511 三菱UFJ -50,000 / 貸方: 1210 八十二銀行 +50,000

## 収益科目マッピング（category_name → 勘定科目）

| category_name | 件数 | 勘定科目 |
|--------------|------|---------|
| Salary | 19 | 4100 給与 |
| Commuting Allowance | 6 | 4120 通勤手当 |
| Bonus | 1 | 4510 賞与 |
| Extraordinary revenue | 1 | 4520 雑収入 |
| Other | 26 | 4520 雑収入 |

## 取引先マスタ（登録済み 32件）

サブスク/定期: Anthropic, Notion, Amazon, エニタイムフィットネス, CPA予備校, JR東日本
インフラ: 中部電力, サンリン, 楽天モバイル, 諏訪市水道局
収入: 長野日本ソフトウエア
小売/飲食: クスリのアオキ, 綿半, ファミリーマート, セブンイレブン, アポロステーション,
テンホウ, スターバックス, 西友, ローソン, 角上魚類, 無印良品, ユニクロ,
ドラッグコスコ, マツモトキヨシ, 丸亀製麺, ウエルシア, DCM, 小林花店,
スシロー, ダイソー, タリーズコーヒー

一回性の店舗（件数1-2）は取引先登録せず、摘要に店名を記載。

## 方針決定事項

| 項目 | 決定 | 理由 |
|------|------|------|
| 移行順序 | 勘定科目体系を先に固める | zaim は読み取り専用、append-only で修正コスト高 |
| 経常/特別分類 | 純資産以外の5区分すべてに適用 | 流動/固定のBS分類 + 経常/特別のPL分類を統一 |
| AD_*/PD_* | 経過勘定として前払/未払で分類 | サービス単位ではなく会計基準で分ける |
| サービス識別 | counterparty + 摘要/タグで管理 | 勘定科目は会計の構造、サービスは属性 |
| 費用の4分類 | 物品/権利/サービス/公課 | 性質による分類。公課は法的強制性で独立 |
| 情報圧縮対策 | tag_type=category/genre で元の分類を保持 | 勘定科目の集約で失われるgenre情報をタグで補完 |
| Books の分離 | EDUCATION_BOOKS / LEARNING_BOOKS / PLEASURE_BOOKS | 資格教育と趣味学習はコストの性質が異なる |
| 人間関係タグ | CLOSE_FRIEND / CASUAL_FRIEND | counterpartyは支払先、人はタグで管理 |
| 負数レコード | 費用の減額として処理 | 立替金（債権管理）より実態に即している |
| 割り勘の回収 | 交際費等の減額 | 回収済みのみ記録されている。債権追跡不要 |
| 割引・値引き | 同一科目の費用減額 | 符号反転で自動的に正しい仕訳になる |
| CY_WALLET | 1110 現金 | CY = Currency、財布の現金 |
| CD_PRIVATE | 1300 立替金 | 個人的な貸し |
| CC_AMAZON | 2140 三井住友カード | カード名称変更 |
| 賞与 | 4510 特別収益 | 経常的ではない |
| 駐車場代 | 5385 サービス | 家賃と同様、場所を使わせてもらう役務 |
| 美容費 | 5397 サービス | Health/Beauty Salon を医療費と分離 |
| 情報サービス | 5396 サービス | Overhead（Console, LLM, logistics等）の受け皿 |
| Inconsistent | 雑損(5510)で処理 | 残高補正用レコード |
| BK_JRE負数振替 | 正常な振替 | クレジット会社からの返金 |
| 開始残高 | 資本仮勘定(3100)との振替 | すべての初期残高を資本仮勘定で受ける |

## Inconsistent レコード（4件）

クスリのアオキでのデータ不整合。zaim 側のデータ品質問題と思われる。

| date | amount | from_account | place |
|---|---|---|---|
| 2025-08-05 | +117 | CY_MOBILE_SUICA | クスリのアオキ 諏訪上川店 |
| 2025-09-10 | -993 | CY_MOBILE_SUICA | クスリのアオキ 諏訪上川店 |
| 2026-01-22 | -1,086 | CY_MOBILE_SUICA | クスリのアオキ 諏訪上川店 |
| 2026-02-09 | -3 | CC_VIEW | — |

→ 一括ではなく1レコード1仕訳で、それぞれ 5510 雑損として処理する。

## DP_PRIVATE の実態（解決済み）

transfer レコードから判明。**個人的な一時預け金・立替金**。

| date | direction | amount | comment |
|---|---|---|---|
| 2025-04-22 | BK_82 → DP_PRIVATE | 100,000 | to my sister |
| 2025-07-15 | DP_PRIVATE → BK_JRE | 100,000 | （回収） |
| 2025-08-17 | CY_WALLET → DP_PRIVATE | 10,000 | 諭吉 |
| 2025-10-21 | CY_WALLET → DP_PRIVATE | 20,000 | 父へ |
| 2025-10-25 | DP_PRIVATE → CY_WALLET | 20,000 | （回収） |
| 2025-10-28 | DP_PRIVATE → CY_WALLET | 10,000 | （回収） |
| 2026-02-15 | CC_VIEW → DP_PRIVATE | 7,600 | イヌカフェ予約 |
| 2026-02-18 | CC_VIEW → DP_PRIVATE | 3,000 | chatGPT |
| 2026-02-26 | DP_PRIVATE → CY_WALLET | 3,000 | （回収） |
| 2026-03-01 | DP_PRIVATE → (payment) | 7,600 | サモエドカフェ |

用途: 家族への一時的な貸し、将来の支出用の仮置き → 1522 個人預け金で正しい。

## Other/Other 5件の内訳（解決済み）

| date | amount | item_name | from_account | 判定 |
|---|---|---|---|---|
| 2025-03-31 | 11,000 | adjust initial balance | PD_Kindle_Unlimited | 開始残高調整 |
| 2025-10-12 | 2,547 | 紛失による雑損 | CY_PASUMO | 5510 雑損 |
| 2025-10-31 | 2,530 | 雑損 | CY_WALLET | 5510 雑損 |
| 2025-12-14 | 2,075 | 雑損(プリペイドカード紛失) | DP_TATEISHI | 5510 雑損 |
| 2026-02-11 | 560 | 雑損 | CY_MOBILE_SUICA | 5510 雑損 |

→ 4件は 5510 雑損。1件は開始残高調整 → 資本仮勘定(3100)との振替で処理。

## 移行戦略

### 方針

- Git 管理の SQL スクリプト + TEMP TABLE によるマッピング
- DB に永続的なマッピングテーブルは作らない
- zaim_id による冪等な差分インポート（何度でも安全に再実行可能）
- zaim は現在進行形で更新されるため、定期実行を想定

### ファイル構成

```
scripts/
├── migration_mappings_v1.sql   -- カスタムカテゴリ期間用（現在）
├── migration_mappings_v2.sql   -- デフォルトカテゴリ期間用（将来）
└── import_zaim.sql             -- 共通の変換・INSERT ロジック
```

### バージョニング

| 版 | 期間 | zaim カテゴリ | 備考 |
|---|---|---|---|
| v1 | 2025-03 〜 有料期間終了 | カスタムカテゴリ | 本ドキュメントのマッピング |
| v2 | 有料期間終了後〜 | デフォルトカテゴリ | リセット後に再調査 |

### 冪等性の担保

- `source:ZAIM` タグで移行データを識別
- journal.description に zaim_id を含め、既存チェックに使用
- `WHERE NOT EXISTS (SELECT 1 FROM journal WHERE description LIKE 'zaim:' || z.zaim_id)` で重複排除

## TODO

- [x] AD_*/PD_* の方針確定 → 前払費用 / 未払費用で分類
- [x] Zaim アカウント体系の調査・整理
- [x] 既存勘定科目とのギャップ分析
- [x] 勘定科目体系の設計（経常/特別分類、費用4分類、番号体系）
- [x] 取引先マスタ登録（32件）
- [x] 費用科目マッピング確定（72パターン → 勘定科目 + タグ）
- [x] タグマスタ設計（label 75 + relationship 2 + source 1 = 78）
- [x] 負数レコードの分析（割引188件 + 割り勘回収20件 + 特殊ケース）
- [x] DP_PRIVATE の詳細確認 → 個人的な一時預け金
- [x] Other/Other 5件の確認 → 雑損4件 + 開始残高調整1件
- [x] Inconsistent 4件 → 雑損(5510)で処理
- [x] BK_JRE 負数振替(-1,450) → クレジット会社からの返金（正常）
- [x] 開始残高の設計 → 資本仮勘定(3100)との振替
- [ ] 勘定科目のDB登録（既存科目のdisplay_code変更 + 新規科目追加）
- [x] タグマスタのDB登録（78件: label 75 + relationship 2 + source 1）
- [ ] 移行スクリプト作成（段階的に実行可能な設計）
- [ ] 移行後の残高検証
