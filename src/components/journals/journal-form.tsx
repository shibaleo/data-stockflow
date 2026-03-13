"use client";

import { useState, useEffect } from "react";
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
import { api } from "@/lib/api-client";

interface Account {
  code: string;
  display_code: string;
  name: string;
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
    amount: string;
    description: string | null;
  }[];
}

/** Each visual row can have debit, credit, or both */
interface RowData {
  debit_account_code: string;
  debit_amount: string;
  credit_account_code: string;
  credit_amount: string;
  description: string;
}

const EMPTY_ROW: RowData = {
  debit_account_code: "",
  debit_amount: "",
  credit_account_code: "",
  credit_amount: "",
  description: "",
};

const INITIAL_ROWS = 5;

interface Props {
  editCode: string | null;
  onSuccess: () => void;
  onCancel: () => void;
}

export function JournalForm({ editCode, onSuccess, onCancel }: Props) {
  const [accounts, setAccounts] = useState<Account[]>([]);
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

  // Load master data
  useEffect(() => {
    Promise.all([
      api.get<{ data: Account[] }>("/accounts?limit=200"),
      api.get<{ data: FiscalPeriod[] }>("/fiscal-periods?limit=50"),
    ])
      .then(([accountRes, fpRes]) => {
        setAccounts(accountRes.data);
        const openPeriods = fpRes.data.filter((fp) => fp.status === "open");
        setFiscalPeriods(openPeriods);
        if (openPeriods.length > 0 && !fiscalPeriodCode) {
          setFiscalPeriodCode(openPeriods[0].code);
        }
      })
      .catch(() => {
        setError("マスタデータの読み込みに失敗しました");
      });
  }, []);

  // Load existing journal for edit
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

        // Convert lines → paired rows
        const debits = j.lines.filter((l) => l.side === "debit");
        const credits = j.lines.filter((l) => l.side === "credit");
        const maxLen = Math.max(debits.length, credits.length, INITIAL_ROWS);
        const newRows: RowData[] = [];
        for (let i = 0; i < maxLen; i++) {
          newRows.push({
            debit_account_code: debits[i]?.account_code || "",
            debit_amount: debits[i]?.amount || "",
            credit_account_code: credits[i]?.account_code || "",
            credit_amount: credits[i]?.amount || "",
            description:
              debits[i]?.description || credits[i]?.description || "",
          });
        }
        setRows(newRows);
      })
      .catch(() => setError("仕訳の読み込みに失敗しました"))
      .finally(() => setLoading(false));
  }, [editCode]);

  const updateRow = (
    index: number,
    field: keyof RowData,
    value: string
  ) => {
    setRows((prev) =>
      prev.map((r, i) => (i === index ? { ...r, [field]: value } : r))
    );
  };

  const addRow = () => {
    setRows((prev) => [...prev, { ...EMPTY_ROW }]);
  };

  const removeRow = (index: number) => {
    setRows((prev) => prev.filter((_, i) => i !== index));
  };

  // Balance calculation
  const debitTotal = rows.reduce(
    (sum, r) => sum + (parseFloat(r.debit_amount) || 0),
    0
  );
  const creditTotal = rows.reduce(
    (sum, r) => sum + (parseFloat(r.credit_amount) || 0),
    0
  );
  const diff = debitTotal - creditTotal;
  const isBalanced = debitTotal === creditTotal && debitTotal > 0;

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

    // Convert rows → individual lines for API
    const lines: {
      line_group: number;
      side: string;
      account_code: string;
      amount: number;
      description?: string;
    }[] = [];

    let group = 1;
    for (const row of rows) {
      const hasDebit = row.debit_account_code && parseFloat(row.debit_amount) > 0;
      const hasCredit =
        row.credit_account_code && parseFloat(row.credit_amount) > 0;

      if (hasDebit) {
        lines.push({
          line_group: group,
          side: "debit",
          account_code: row.debit_account_code,
          amount: parseFloat(row.debit_amount),
          description: row.description || undefined,
        });
      }
      if (hasCredit) {
        lines.push({
          line_group: group,
          side: "credit",
          account_code: row.credit_account_code,
          amount: parseFloat(row.credit_amount),
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

  const accountLabel = (code: string) => {
    const a = accounts.find((x) => x.code === code);
    return a ? `${a.display_code} ${a.name}` : "";
  };

  return (
    <div className="flex flex-col h-full">
      {/* ── Header bar ── */}
      <div className="flex flex-wrap items-center gap-3 border-b border-border bg-card px-4 py-2">
        <span
          className={`rounded px-2 py-0.5 text-xs font-bold ${
            editCode
              ? "bg-yellow-600 text-white"
              : "bg-green-600 text-white"
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
            <Select
              value={fiscalPeriodCode}
              onValueChange={setFiscalPeriodCode}
            >
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

      {/* ── Grid table ── */}
      <div className="flex-1 overflow-auto">
        <table className="w-full border-collapse text-xs">
          <thead className="sticky top-0 z-10">
            <tr className="bg-muted/60">
              <th
                className="border border-border px-1 py-1.5 text-center font-medium w-8"
                rowSpan={2}
              >
                行
              </th>
              <th
                className="border border-border px-2 py-1.5 text-center font-medium bg-blue-900/30"
                colSpan={2}
              >
                借方
              </th>
              <th
                className="border border-border px-2 py-1.5 text-center font-medium bg-blue-900/30"
                colSpan={2}
              >
                貸方
              </th>
              <th
                className="border border-border px-2 py-1.5 text-center font-medium"
                rowSpan={2}
              >
                摘要
              </th>
              <th
                className="border border-border px-1 py-1.5 w-8"
                rowSpan={2}
              />
            </tr>
            <tr className="bg-muted/40">
              <th className="border border-border px-2 py-1 text-center font-medium text-muted-foreground">
                勘定科目
              </th>
              <th className="border border-border px-2 py-1 text-center font-medium text-muted-foreground w-28">
                金額
              </th>
              <th className="border border-border px-2 py-1 text-center font-medium text-muted-foreground">
                勘定科目
              </th>
              <th className="border border-border px-2 py-1 text-center font-medium text-muted-foreground w-28">
                金額
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} className="hover:bg-accent/20">
                <td className="border border-border px-1 py-1 text-center text-muted-foreground font-mono">
                  {i + 1}
                </td>
                {/* Debit account */}
                <td className="border border-border p-0.5">
                  <Select
                    value={row.debit_account_code}
                    onValueChange={(v) =>
                      updateRow(i, "debit_account_code", v)
                    }
                  >
                    <SelectTrigger className="h-7 border-0 bg-transparent text-xs shadow-none">
                      <SelectValue placeholder="" />
                    </SelectTrigger>
                    <SelectContent>
                      {accounts.map((a) => (
                        <SelectItem key={a.code} value={a.code}>
                          {a.display_code} {a.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </td>
                {/* Debit amount */}
                <td className="border border-border p-0.5">
                  <Input
                    type="number"
                    min="0"
                    step="1"
                    value={row.debit_amount}
                    onChange={(e) =>
                      updateRow(i, "debit_amount", e.target.value)
                    }
                    className="h-7 border-0 bg-transparent text-xs text-right shadow-none"
                  />
                </td>
                {/* Credit account */}
                <td className="border border-border p-0.5">
                  <Select
                    value={row.credit_account_code}
                    onValueChange={(v) =>
                      updateRow(i, "credit_account_code", v)
                    }
                  >
                    <SelectTrigger className="h-7 border-0 bg-transparent text-xs shadow-none">
                      <SelectValue placeholder="" />
                    </SelectTrigger>
                    <SelectContent>
                      {accounts.map((a) => (
                        <SelectItem key={a.code} value={a.code}>
                          {a.display_code} {a.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </td>
                {/* Credit amount */}
                <td className="border border-border p-0.5">
                  <Input
                    type="number"
                    min="0"
                    step="1"
                    value={row.credit_amount}
                    onChange={(e) =>
                      updateRow(i, "credit_amount", e.target.value)
                    }
                    className="h-7 border-0 bg-transparent text-xs text-right shadow-none"
                  />
                </td>
                {/* Description */}
                <td className="border border-border p-0.5">
                  <Input
                    value={row.description}
                    onChange={(e) =>
                      updateRow(i, "description", e.target.value)
                    }
                    className="h-7 border-0 bg-transparent text-xs shadow-none"
                  />
                </td>
                {/* Remove */}
                <td className="border border-border p-0.5 text-center">
                  <button
                    onClick={() => removeRow(i)}
                    disabled={rows.length <= 1}
                    className="text-muted-foreground hover:text-destructive disabled:opacity-30"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
          {/* ── Totals ── */}
          <tfoot>
            <tr className="bg-muted/40 font-medium">
              <td className="border border-border" />
              <td className="border border-border px-2 py-1.5 text-center text-xs">
                借方合計
              </td>
              <td className="border border-border px-2 py-1.5 text-right text-xs font-mono">
                {debitTotal.toLocaleString()}
              </td>
              <td className="border border-border px-2 py-1.5 text-center text-xs">
                貸方合計
              </td>
              <td className="border border-border px-2 py-1.5 text-right text-xs font-mono">
                {creditTotal.toLocaleString()}
              </td>
              <td className="border border-border" />
              <td className="border border-border" />
            </tr>
            <tr className="bg-muted/40 font-medium">
              <td className="border border-border" />
              <td className="border border-border" />
              <td className="border border-border" />
              <td className="border border-border px-2 py-1.5 text-center text-xs">
                差額
              </td>
              <td
                className={`border border-border px-2 py-1.5 text-right text-xs font-mono ${
                  diff === 0 ? "text-green-400" : "text-red-400"
                }`}
              >
                {diff.toLocaleString()}
              </td>
              <td className="border border-border" />
              <td className="border border-border" />
            </tr>
          </tfoot>
        </table>
      </div>

      {/* ── Bottom bar ── */}
      <div className="border-t border-border bg-card px-4 py-2">
        <div className="flex items-center gap-3">
          {/* Header description */}
          <span className="text-xs text-muted-foreground shrink-0">
            ヘッダ摘要
          </span>
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

          {error && (
            <span className="text-xs text-destructive">{error}</span>
          )}

          <div className="ml-auto flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={onCancel}
              disabled={loading}
            >
              キャンセル
            </Button>
            <Button
              size="sm"
              onClick={handleSubmit}
              disabled={loading || !isBalanced}
            >
              {loading
                ? "保存中..."
                : editCode
                  ? "登録して一覧に戻る"
                  : "登録して一覧に戻る"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
