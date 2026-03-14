"use client";

import React, { useState, useEffect } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MasterCombobox, type ComboOption } from "./master-combobox";
import { api } from "@/lib/api-client";

// ── Master data types ──

interface BookRow {
  code: string;
  name: string;
  unit: string;
  unit_symbol: string;
  unit_position: string;
  is_active: boolean;
}

interface Account {
  code: string;
  display_code: string;
  name: string;
  book_code: string;
  unit_symbol: string;
  unit_position: string;
}

interface Department {
  code: string;
  display_code: string;
  name: string;
  is_active: boolean;
}

interface Counterparty {
  code: string;
  display_code: string;
  name: string;
  is_active: boolean;
}

interface TaxClass {
  code: string;
  display_code: string;
  name: string;
  is_active: boolean;
}

interface FiscalPeriod {
  code: string;
  display_code: string;
  fiscal_year: number;
  period_no: number;
  status: string;
}

interface JournalDetail {
  idempotency_code: string;
  posted_date: string;
  fiscal_period_code: string;
  journal_type: string;
  slip_category: string;
  description: string | null;
  lines: {
    side: string;
    account_code: string;
    department_code: string | null;
    counterparty_code: string | null;
    tax_class_code: string | null;
    amount: string;
    description: string | null;
  }[];
}

// ── Row model (勘定奉行風: 借方/貸方 ペア) ──

interface RowData {
  debit_account_code: string;
  debit_amount: string;
  debit_department_code: string;
  debit_counterparty_code: string;
  debit_tax_class_code: string;
  credit_account_code: string;
  credit_amount: string;
  credit_department_code: string;
  credit_counterparty_code: string;
  credit_tax_class_code: string;
  description: string;
}

const EMPTY_ROW: RowData = {
  debit_account_code: "",
  debit_amount: "",
  debit_department_code: "",
  debit_counterparty_code: "",
  debit_tax_class_code: "",
  credit_account_code: "",
  credit_amount: "",
  credit_department_code: "",
  credit_counterparty_code: "",
  credit_tax_class_code: "",
  description: "",
};

const INITIAL_ROWS = 1;

interface Props {
  editCode: string | null;
  onSuccess: () => void;
  onCancel: () => void;
}

export function JournalForm({ editCode, onSuccess, onCancel }: Props) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [counterparties, setCounterparties] = useState<Counterparty[]>([]);
  const [taxClasses, setTaxClasses] = useState<TaxClass[]>([]);
  const [fiscalPeriods, setFiscalPeriods] = useState<FiscalPeriod[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [postedDate, setPostedDate] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [fiscalPeriodCode, setFiscalPeriodCode] = useState("");
  const [journalType, setJournalType] = useState("normal");
  const [slipCategory, setSlipCategory] = useState("ordinary");
  const [headerDescription, setHeaderDescription] = useState("");
  const [rows, setRows] = useState<RowData[]>(
    Array.from({ length: INITIAL_ROWS }, () => ({ ...EMPTY_ROW }))
  );

  // ── Master data loading ──
  useEffect(() => {
    (async () => {
      try {
        const [booksRes, deptRes, cpRes, tcRes] = await Promise.all([
          api.get<{ data: BookRow[] }>("/books"),
          api.get<{ data: Department[] }>("/departments"),
          api.get<{ data: Counterparty[] }>("/counterparties"),
          api.get<{ data: TaxClass[] }>("/tax-classes"),
        ]);

        const activeBooks = booksRes.data.filter((b) => b.is_active);
        setDepartments(deptRes.data.filter((d) => d.is_active));
        setCounterparties(cpRes.data.filter((c) => c.is_active));
        setTaxClasses(tcRes.data.filter((t) => t.is_active));

        const [accountResults, fpResults] = await Promise.all([
          Promise.all(
            activeBooks.map((b) =>
              api.get<{ data: Account[] }>(`/books/${b.code}/accounts?limit=200`)
            )
          ),
          Promise.all(
            activeBooks.map((b) =>
              api.get<{ data: FiscalPeriod[] }>(`/books/${b.code}/fiscal-periods?limit=50`)
            )
          ),
        ]);

        const allAccounts = accountResults.flatMap((r) => r.data);
        setAccounts(
          Array.from(new Map(allAccounts.map((a) => [a.code, a])).values())
        );

        const uniqueFps = Array.from(
          new Map(fpResults.flatMap((r) => r.data).map((fp) => [fp.code, fp])).values()
        ).filter((fp) => fp.status === "open");
        setFiscalPeriods(uniqueFps);
        if (uniqueFps.length > 0 && !fiscalPeriodCode) {
          setFiscalPeriodCode(uniqueFps[0].code);
        }
      } catch {
        setError("マスタデータの読み込みに失敗しました");
      }
    })();
  }, []);

  // ── Load existing journal for edit ──
  useEffect(() => {
    if (!editCode) return;
    setLoading(true);
    api
      .get<{ data: JournalDetail }>(`/journals/${editCode}`)
      .then((res) => {
        const j = res.data;
        setPostedDate(j.posted_date.slice(0, 10));
        setFiscalPeriodCode(j.fiscal_period_code);
        setJournalType(j.journal_type);
        setSlipCategory(j.slip_category);
        setHeaderDescription(j.description || "");

        const debits = j.lines.filter((l) => l.side === "debit");
        const credits = j.lines.filter((l) => l.side === "credit");
        const maxLen = Math.max(debits.length, credits.length, INITIAL_ROWS);
        const newRows: RowData[] = [];
        for (let i = 0; i < maxLen; i++) {
          const d = debits[i];
          const c = credits[i];
          newRows.push({
            debit_account_code: d?.account_code || "",
            debit_amount: d?.amount || "",
            debit_department_code: d?.department_code || "",
            debit_counterparty_code: d?.counterparty_code || "",
            debit_tax_class_code: d?.tax_class_code || "",
            credit_account_code: c?.account_code || "",
            credit_amount: c?.amount || "",
            credit_department_code: c?.department_code || "",
            credit_counterparty_code: c?.counterparty_code || "",
            credit_tax_class_code: c?.tax_class_code || "",
            description: d?.description || c?.description || "",
          });
        }
        setRows(newRows);
      })
      .catch(() => setError("仕訳の読み込みに失敗しました"))
      .finally(() => setLoading(false));
  }, [editCode]);

  // ── Row helpers ──
  const updateRow = (index: number, field: keyof RowData, value: string) => {
    setRows((prev) =>
      prev.map((r, i) => (i === index ? { ...r, [field]: value } : r))
    );
  };

  const addRow = () => setRows((prev) => [...prev, { ...EMPTY_ROW }]);
  const removeRow = (index: number) =>
    setRows((prev) => prev.filter((_, i) => i !== index));

  // ── Unit helpers ──
  const getUnit = (accountCode: string) => {
    const a = accounts.find((x) => x.code === accountCode);
    return { symbol: a?.unit_symbol ?? "", position: a?.unit_position ?? "left" };
  };

  const fmtUnit = (v: number, symbol: string, position: string) => {
    const formatted = v.toLocaleString();
    if (!symbol) return formatted;
    return position === "right" ? `${formatted} ${symbol}` : `${symbol} ${formatted}`;
  };

  // ── Balance calculation per unit ──
  const balanceByUnit = (() => {
    const map = new Map<string, { symbol: string; position: string; debit: number; credit: number }>();
    const ensure = (key: string, symbol: string, position: string) => {
      if (!map.has(key)) map.set(key, { symbol, position, debit: 0, credit: 0 });
      return map.get(key)!;
    };
    for (const row of rows) {
      if (row.debit_account_code && parseFloat(row.debit_amount) > 0) {
        const u = getUnit(row.debit_account_code);
        ensure(u.symbol + u.position, u.symbol, u.position).debit += parseFloat(row.debit_amount);
      }
      if (row.credit_account_code && parseFloat(row.credit_amount) > 0) {
        const u = getUnit(row.credit_account_code);
        ensure(u.symbol + u.position, u.symbol, u.position).credit += parseFloat(row.credit_amount);
      }
    }
    return Array.from(map.values());
  })();

  const debitTotal = rows.reduce((s, r) => s + (parseFloat(r.debit_amount) || 0), 0);
  const creditTotal = rows.reduce((s, r) => s + (parseFloat(r.credit_amount) || 0), 0);
  const isBalanced = debitTotal === creditTotal && debitTotal > 0;

  // ── Combobox options ──
  const accountOptions: ComboOption[] = accounts.map((a) => ({
    value: a.code,
    label: `${a.display_code} ${a.name}`,
  }));
  const deptOptions: ComboOption[] = departments.map((d) => ({
    value: d.code,
    label: `${d.display_code} ${d.name}`,
  }));
  const cpOptions: ComboOption[] = counterparties.map((c) => ({
    value: c.code,
    label: `${c.display_code} ${c.name}`,
  }));
  const tcOptions: ComboOption[] = taxClasses.map((t) => ({
    value: t.code,
    label: `${t.display_code} ${t.name}`,
  }));

  // ── Submit ──
  const handleSubmit = async () => {
    setError(null);
    if (!postedDate || !fiscalPeriodCode) {
      setError("伝票日付と会計期間は必須です");
      return;
    }
    if (!isBalanced) {
      setError("借方合計と貸方合計が一致しません");
      return;
    }

    const lines: {
      line_group: number;
      side: string;
      account_code: string;
      amount: number;
      department_code?: string;
      counterparty_code?: string;
      tax_class_code?: string;
      description?: string;
    }[] = [];

    let group = 1;
    for (const row of rows) {
      const hasDebit = row.debit_account_code && parseFloat(row.debit_amount) > 0;
      const hasCredit = row.credit_account_code && parseFloat(row.credit_amount) > 0;

      if (hasDebit) {
        lines.push({
          line_group: group,
          side: "debit",
          account_code: row.debit_account_code,
          amount: parseFloat(row.debit_amount),
          department_code: row.debit_department_code || undefined,
          counterparty_code: row.debit_counterparty_code || undefined,
          tax_class_code: row.debit_tax_class_code || undefined,
          description: row.description || undefined,
        });
      }
      if (hasCredit) {
        lines.push({
          line_group: group,
          side: "credit",
          account_code: row.credit_account_code,
          amount: parseFloat(row.credit_amount),
          department_code: row.credit_department_code || undefined,
          counterparty_code: row.credit_counterparty_code || undefined,
          tax_class_code: row.credit_tax_class_code || undefined,
          description: hasDebit ? undefined : row.description || undefined,
        });
      }
      if (hasDebit || hasCredit) group++;
    }

    if (lines.length < 2) {
      setError("少なくとも借方・貸方各1行は必要です");
      return;
    }

    setLoading(true);
    try {
      if (editCode) {
        await api.put(`/journals/${editCode}`, {
          posted_date: new Date(postedDate).toISOString(),
          journal_type: journalType,
          slip_category: slipCategory,
          description: headerDescription || undefined,
          lines,
        });
      } else {
        await api.post("/journals", {
          idempotency_code: `web:${crypto.randomUUID()}`,
          fiscal_period_code: fiscalPeriodCode,
          posted_date: new Date(postedDate).toISOString(),
          journal_type: journalType,
          slip_category: slipCategory,
          description: headerDescription || undefined,
          lines,
        });
      }
      onSuccess();
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存に失敗しました");
    } finally {
      setLoading(false);
    }
  };

  // ── Unit label beside amount input ──
  const UnitLabel = ({ accountCode, side }: { accountCode: string; side: "left" | "right" }) => {
    const u = getUnit(accountCode);
    if (!u.symbol || u.position !== side) return null;
    return <span className="text-[10px] text-muted-foreground shrink-0 px-1">{u.symbol}</span>;
  };

  // ── One side (debit or credit) of a row — 4 sub-rows like 勘定奉行 ──
  const SideCell = ({ row, i, side }: { row: RowData; i: number; side: "debit" | "credit" }) => {
    const prefix = side === "debit" ? "debit" : "credit";
    const acctCode = row[`${prefix}_account_code`];
    const amount = row[`${prefix}_amount`];
    const deptCode = row[`${prefix}_department_code`];
    const cpCode = row[`${prefix}_counterparty_code`];
    const tcCode = row[`${prefix}_tax_class_code`];

    return (
      <div className="divide-y divide-border">
        {/* Row 1: 部門 */}
        <MasterCombobox
          options={deptOptions}
          value={deptCode}
          onValueChange={(v) => updateRow(i, `${prefix}_department_code`, v)}
          placeholder="部門"
        />
        {/* Row 2: 勘定科目 + 金額 */}
        <div className="flex items-center">
          <div className="flex-1 min-w-0">
            <MasterCombobox
              options={accountOptions}
              value={acctCode}
              onValueChange={(v) => updateRow(i, `${prefix}_account_code`, v)}
              placeholder="勘定科目"
            />
          </div>
          <div className="flex items-center w-28 shrink-0 border-l border-border">
            <UnitLabel accountCode={acctCode} side="left" />
            <Input
              type="number"
              min="0"
              step="1"
              value={amount}
              onChange={(e) => updateRow(i, `${prefix}_amount`, e.target.value)}
              className="h-7 border-0 bg-transparent text-xs text-right shadow-none focus-visible:ring-0 flex-1"
            />
            <UnitLabel accountCode={acctCode} side="right" />
          </div>
        </div>
        {/* Row 3: 税区分 */}
        <MasterCombobox
          options={tcOptions}
          value={tcCode}
          onValueChange={(v) => updateRow(i, `${prefix}_tax_class_code`, v)}
          placeholder="税区分"
        />
        {/* Row 4: 取引先 */}
        <MasterCombobox
          options={cpOptions}
          value={cpCode}
          onValueChange={(v) => updateRow(i, `${prefix}_counterparty_code`, v)}
          placeholder="取引先"
        />
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full">
      {/* ── Header bar ── */}
      <div className="flex flex-wrap items-center gap-3 border-b border-border bg-card px-4 py-2">
        <span
          className={`rounded px-2 py-0.5 text-xs font-bold ${
            editCode ? "bg-yellow-600 text-white" : "bg-green-600 text-white"
          }`}
        >
          {editCode ? "修正" : "新規"}
        </span>

        <Select value={journalType} onValueChange={setJournalType}>
          <SelectTrigger className="w-28 h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="normal">日常仕訳</SelectItem>
            <SelectItem value="closing">決算仕訳</SelectItem>
            <SelectItem value="prior_adj">前期調整</SelectItem>
            <SelectItem value="auto">自動仕訳</SelectItem>
          </SelectContent>
        </Select>

        <Select value={slipCategory} onValueChange={setSlipCategory}>
          <SelectTrigger className="w-28 h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ordinary">通常伝票</SelectItem>
            <SelectItem value="transfer">振替伝票</SelectItem>
            <SelectItem value="receipt">入金伝票</SelectItem>
            <SelectItem value="payment">出金伝票</SelectItem>
          </SelectContent>
        </Select>

        <div className="flex items-center gap-1">
          <span className="text-xs text-muted-foreground">伝票日付</span>
          <Input
            type="date"
            value={postedDate}
            onChange={(e) => setPostedDate(e.target.value)}
            className="w-36 h-8 text-xs"
          />
        </div>

        {!editCode && (
          <div className="flex items-center gap-1">
            <span className="text-xs text-muted-foreground">会計期間</span>
            <Select value={fiscalPeriodCode} onValueChange={setFiscalPeriodCode}>
              <SelectTrigger className="w-28 h-8 text-xs">
                <SelectValue placeholder="選択" />
              </SelectTrigger>
              <SelectContent>
                {fiscalPeriods.map((fp) => (
                  <SelectItem key={fp.code} value={fp.code}>
                    {fp.display_code}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {/* ── Grid table (勘定奉行スタイル) ── */}
      <div className="flex-1 overflow-auto">
        <table className="w-full border-collapse text-xs">
          <thead className="sticky top-0 z-10">
            <tr className="bg-muted/60">
              <th className="border border-border px-1 py-1.5 text-center font-medium w-8" rowSpan={2}>
                行
              </th>
              <th className="border border-border px-2 py-1.5 text-center font-medium bg-blue-900/30" colSpan={1}>
                借方
              </th>
              <th className="border border-border px-2 py-1.5 text-center font-medium bg-blue-900/30" colSpan={1}>
                貸方
              </th>
              <th className="border border-border px-2 py-1.5 text-center font-medium" rowSpan={2}>
                摘要
              </th>
              <th className="border border-border px-1 py-1.5 w-8" rowSpan={2} />
            </tr>
            <tr className="bg-muted/40">
              <th className="border border-border px-2 py-1 text-center font-medium text-muted-foreground text-[10px]">
                部門 / 勘定科目 / 税区分 / 取引先
              </th>
              <th className="border border-border px-2 py-1 text-center font-medium text-muted-foreground text-[10px]">
                部門 / 勘定科目 / 税区分 / 取引先
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} className="hover:bg-accent/10 align-top">
                <td className="border border-border px-1 py-2 text-center text-muted-foreground font-mono">
                  {i + 1}
                </td>
                {/* Debit side */}
                <td className="border border-border p-0">
                  <SideCell row={row} i={i} side="debit" />
                </td>
                {/* Credit side */}
                <td className="border border-border p-0">
                  <SideCell row={row} i={i} side="credit" />
                </td>
                {/* Description */}
                <td className="border border-border p-0">
                  <textarea
                    value={row.description}
                    onChange={(e) => updateRow(i, "description", e.target.value)}
                    className="w-full h-full min-h-[7rem] resize-none border-0 bg-transparent px-2 py-1.5 text-xs outline-none focus:bg-accent/30"
                    placeholder="摘要"
                  />
                </td>
                {/* Remove */}
                <td className="border border-border p-0.5 text-center align-top">
                  <button
                    onClick={() => removeRow(i)}
                    disabled={rows.length <= 1}
                    className="text-muted-foreground hover:text-destructive disabled:opacity-30 mt-1"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
          {/* ── Totals per unit ── */}
          <tfoot>
            {balanceByUnit.map((u, idx) => {
              const diff = u.debit - u.credit;
              const fmt = (v: number) => fmtUnit(v, u.symbol, u.position);
              return (
                <React.Fragment key={idx}>
                  <tr className="bg-muted/40 font-medium">
                    <td className="border border-border" />
                    <td className="border border-border px-2 py-1.5 text-right text-xs font-mono">
                      借方合計{u.symbol && <span className="text-muted-foreground ml-1">({u.symbol})</span>}
                      <span className="ml-2">{fmt(u.debit)}</span>
                    </td>
                    <td className="border border-border px-2 py-1.5 text-right text-xs font-mono">
                      貸方合計
                      <span className="ml-2">{fmt(u.credit)}</span>
                    </td>
                    <td className="border border-border px-2 py-1.5 text-center text-xs">
                      差額
                      <span
                        className={`ml-2 font-mono ${diff === 0 ? "text-green-400" : "text-red-400"}`}
                      >
                        {fmt(diff)}
                      </span>
                    </td>
                    <td className="border border-border" />
                  </tr>
                </React.Fragment>
              );
            })}
          </tfoot>
        </table>
      </div>

      {/* ── Bottom bar ── */}
      <div className="border-t border-border bg-card px-4 py-2">
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground shrink-0">ヘッダ摘要</span>
          <Input
            value={headerDescription}
            onChange={(e) => setHeaderDescription(e.target.value)}
            placeholder="伝票全体の摘要"
            className="h-8 text-xs flex-1"
          />

          <Button variant="outline" size="sm" onClick={addRow}>
            <Plus className="size-3.5 mr-1" />
            行追加
          </Button>

          {error && <span className="text-xs text-destructive">{error}</span>}

          <div className="ml-auto flex gap-2">
            <Button variant="outline" size="sm" onClick={onCancel} disabled={loading}>
              キャンセル
            </Button>
            <Button size="sm" onClick={handleSubmit} disabled={loading || !isBalanced}>
              {loading ? "保存中..." : "登録して一覧に戻る"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
