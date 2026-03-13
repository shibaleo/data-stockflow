# 勘定科目見直し — 進捗メモ

## 方針

- Zaim の約 2,600 件（income 55 + payment 2,608）のトランザクションに対して勘定科目を整備する
- **income（55件）**: Zaim 側のカテゴリを直接編集して正しい分類にする
- **payment（2,608件）**: Zaim 側は触らず、account-mapping で勘定科目に変換する
- Zaim の genre（サブカテゴリ）まで使えばほぼ 1:1 で勘定科目にマッピング可能

## Zaim の制約（判明事項）

- income にはitem名（適用）を設定できない
- income を payment には変更できるが、transfer には変更できない
- income の元入金エントリは「削除して初期残高を調整」で対応する

---

## 収益科目（income）— 見直し中

### 確定した勘定科目構造

```
4000 経常収益
  4100 給与
  4110 残業手当（新設）
  4120 通勤手当

4500 特別収益
  4510 賞与
  4520 雑収入
  4530 受取利息（新設）
```

分類基準:
- 経常 = 3ヶ月以内の頻度で発生するもの
- 特別 = 3ヶ月超の頻度（受取利息は半年ごと → 特別）

### Zaim 編集 — 完了分

- [x] 利息 6件（Other → Business income に変更済み）

### Zaim 編集 — 未実施

#### 元入金の削除（5件）

income を削除し、対応する口座の初期残高に加算する。

| zaim_id | 金額 | 内容 | 初期残高加算先 |
|---------|------|------|---------------|
| 9051100620 | ¥418,000 | CPA tuition | PD_CPA |
| 9051011117 | ¥19,800 | Notion plus plan | PD_Notion |
| 9051074855 | ¥11,000 | (なし) | CY_WALLET |
| 9051033154 | ¥2,950 | Amazon Prime | PD_Amazon_Prime |
| 9051112700 | ¥980 | (なし) | PD_Kindle_Unlimited |

#### カテゴリ変更（1件）

| zaim_id | 金額 | 現在 | 変更先 | 理由 |
|---------|------|------|--------|------|
| 9468697412 | ¥489,800 | Salary | Bonus | comment「賞与489,800」 |

#### 確認が必要（4件）

| zaim_id | 金額 | comment / to_account | 論点 |
|---------|------|---------------------|------|
| 9042310839 | ¥20,000 | 聖光寺解体父より (CY_WALLET) | 贈与？→ 削除して初期残高？ |
| 9352855393 | ¥10,000 | (CY_MOBILE_SUICA) | Suica チャージ？→ 削除して初期残高？ |
| 9347617930 | ¥10,000 | 諏訪市定額減税不足額給付 (JP_POST) | Extraordinary revenue に変更？ |
| DP_TATEISHI 5件 | ¥100-500 | ユメックスポイントボーナス | 雑収入 (Other→4520) のまま？ |

#### 残業手当の分離（未解決）

Zaim の income では item 名を設定できないため、残業手当を item で区別する案は使えない。
対応案:
1. comment に「残業手当」が含まれるかで mapping 側で分岐
2. 残業手当を給与と分けず 4100 に統合（シンプル）
3. Zaim の genre が設定可能なら genre で分ける

→ 次回決定

### マッピング設定（Zaim 編集完了後に実施）

| source_system | source_field | source_value | side | account_code |
|--------------|-------------|-------------|------|-------------|
| zaim | category | Salary | credit | 4100 |
| zaim | category | Commuting Allowance | credit | 4120 |
| zaim | category | Bonus | credit | 4510 |
| zaim | category | Other | credit | 4520 |
| zaim | category | Extraordinary revenue | credit | 4500 |
| zaim | category | Business income | credit | 4530 |

※ 残業手当 (4110) のマッピングは分離方法決定後に追加

---

## 費用科目（payment）— 未着手

payment 2,608件は Zaim 側を書き換えず、account-mapping で対応する。

### Zaim payment カテゴリ一覧（参考）

| category | genre | 件数 | 合計 |
|----------|-------|------|------|
| Food | Groceries | 1,215 | ¥242,362 |
| Pleasure | Snacks | 249 | ¥42,392 |
| Casual | Friends | 116 | ¥131,504 |
| Pleasure | Eatery | 110 | ¥80,415 |
| Transport | Gasoline | 97 | ¥140,297 |
| Items | Hygiene | 64 | ¥35,130 |
| Maintenance | Laundry | 67 | ¥49,499 |
| Pleasure | Cafe | 59 | ¥59 |
| Casual | Temporary | 53 | ¥90,496 |
| Transport | Train | 53 | ¥76,156 |
| Food | Stable | 42 | ¥17,606 |
| Items | Cosme/Kitchen/Clothes 等 | 147 | ¥149,591 |
| Obligation | Pension/Health Ins./Tax 等 | 62 | ¥513,199 |
| Infra | Rent/Phone/Electricity 等 | 42 | ¥706,454 |
| Health | Hospital/Medicine 等 | 27 | ¥192,788 |
| Education | Tuition/Books 等 | 20 | ¥580,521 |
| Work | Business Party/Clothes 等 | 32 | ¥69,760 |
| Overhead | Console/LLM 等 | 32 | ¥131,243 |
| Close | Father/Mother/Partner 等 | 45 | ¥56,073 |
| Other | | 6 | ¥18,812 |
| Learning | Books | 7 | ¥8,363 |

→ 勘定科目設計 + マッピング定義は次回実施

---

## 全体 TODO

### 勘定科目見直し
- [ ] 収益: 未確認の4件を判断
- [ ] 収益: 残業手当の分離方法を決定
- [ ] 収益: Zaim 編集実施（元入金削除、賞与カテゴリ変更）
- [ ] 収益: DB に 4110, 4530 を新設
- [ ] 収益: account-mapping を設定
- [ ] 費用: 勘定科目構造を設計
- [ ] 費用: account-mapping を設定

### API / 機能
- [ ] レポート API 充実（試算表・総勘定元帳・仕訳帳）
- [ ] 一括仕訳 API（POST /api/ops/v1/journals/batch）
- [ ] 閉鎖済期間の記帳拒否（journals POST/PUT で status=closed 拒否）

### データパイプライン
- [ ] Zaim → journal 変換パイプライン実装
- [ ] account-mapping / payment-mapping のシードデータ投入
