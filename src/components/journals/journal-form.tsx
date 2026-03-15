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
import { MasterCombobox, type ComboOption } from "./master-combobox";
import { api } from "@/lib/api-client";
import { formatAmount } from "@/lib/format";

// ── Master data types (v2: numeric ids) ──

interface BookRow {
  id: number;
  code: string;
  name: string;
  unit: string;
  unit_symbol: string;
  unit_position: string;
  is_active: boolean;
}

interface Account {
  id: number;
  code: string;
  name: string;
  book_id: number;
}

interface Department {
  id: number;
  code: string;
  name: string;
  is_active: boolean;
}

interface Counterparty {
  id: number;
  code: string;
  name: string;
  is_active: boolean;
}

interface FiscalPeriod {
  id: number;
  code: string;
  start_date: string;
  end_date: string;
  status: string;
}

interface VoucherDetail {
  id: number;
  fiscal_period_id: number;
  voucher_code: string | null;
  posted_date: string;
  description: string | null;
  journals: {
    id: number;
    book_id: number;
    revision: number;
    journal_type: string;
    slip_category: string;
    adjustment_flag: string;
    description: string | null;
    lines: {
      side: string;
      account_id: number;
      department_id: number | null;
      counterparty_id: number | null;
      amount: string;
      description: string | null;
    }[];
  }[];
}

// ── Row model (勘定奉行風: 借方/貸方 ペア) ──

interface RowData {
  debit_account_id: string;
  debit_amount: string;
  debit_department_id: string;
  debit_counterparty_id: string;
  credit_account_id: string;
  credit_amount: string;
  credit_department_id: string;
  credit_counterparty_id: string;
  description: string;
}

const EMPTY_ROW: RowData = {
  debit_account_id: "",
  debit_amount: "",
  debit_department_id: "",
  debit_counterparty_id: "",
  credit_account_id: "",
  credit_amount: "",
  credit_department_id: "",
  credit_counterparty_id: "",
  description: "",
};

const INITIAL_ROWS = 1;

interface Props {
  /** Voucher ID to edit, or null for new */
  editId: number | null;
  onSuccess: () => void;
  onCancel: () => void;
}

export function JournalForm({ editId, onSuccess, onCancel }: Props) {
  const [books, setBooks] = useState<BookRow[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [counterparties, setCounterparties] = useState<Counterparty[]>([]);
  const [fiscalPeriods, setFiscalPeriods] = useState<FiscalPeriod[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [bookId, setBookId] = useState<string>("");
  const [postedDate, setPostedDate] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [fiscalPeriodId, setFiscalPeriodId] = useState("");
  const [journalType, setJournalType] = useState("normal");
  const [slipCategory, setSlipCategory] = useState("ordinary");
  const [headerDescription, setHeaderDescription] = useState("");
  const [rows, setRows] = useState<RowData[]>(
    Array.from({ length: INITIAL_ROWS }, () => ({ ...EMPTY_ROW }))
  );

  const selectedBook = books.find((b) => String(b.id) === bookId) ?? null;

  // ── Master data loading ──
  useEffect(() => {
    (async () => {
      try {
        const [booksRes, deptRes, cpRes] = await Promise.all([
          api.get<{ data: BookRow[] }>("/books"),
          api.get<{ data: Department[] }>("/departments"),
          api.get<{ data: Counterparty[] }>("/counterparties"),
        ]);

        const activeBooks = booksRes.data.filter((b) => b.is_active);
        setBooks(activeBooks);
        setDepartments(deptRes.data.filter((d) => d.is_active));
        setCounterparties(cpRes.data.filter((c) => c.is_active));

        if (activeBooks.length > 0 && !bookId) {
          setBookId(String(activeBooks[0].id));
        }

        // Load accounts and fiscal periods for all books
        const [accountResults, fpResults] = await Promise.all([
          Promise.all(
            activeBooks.map((b) =>
              api.get<{ data: Account[] }>(`/books/${b.id}/accounts?limit=200`)
            )
          ),
          Promise.all(
            activeBooks.map((b) =>
              api.get<{ data: FiscalPeriod[] }>(`/books/${b.id}/fiscal-periods?limit=50`)
            )
          ),
        ]);

        const allAccounts = accountResults.flatMap((r) => r.data);
        setAccounts(
          Array.from(new Map(allAccounts.map((a) => [a.id, a])).values())
        );

        const uniqueFps = Array.from(
          new Map(fpResults.flatMap((r) => r.data).map((fp) => [fp.id, fp])).values()
        ).filter((fp) => fp.status === "open");
        setFiscalPeriods(uniqueFps);
        if (uniqueFps.length > 0 && !fiscalPeriodId) {
          setFiscalPeriodId(String(uniqueFps[0].id));
        }
      } catch {
        setError("マスタデータの読み込みに失敗しました");
      }
    })();
  }, []);

  // ── Load existing voucher for edit ──
  useEffect(() => {
    if (!editId) return;
    setLoading(true);
    api
      .get<{ data: VoucherDetail }>(`/vouchers/${editId}`)
      .then((res) => {
        const v = res.data;
        setPostedDate(v.posted_date.slice(0, 10));
        setFiscalPeriodId(String(v.fiscal_period_id));
        setHeaderDescription(v.description || "");

        // Use first journal for type/category
        const j = v.journals[0];
        if (j) {
          setBookId(String(j.book_id));
          setJournalType(j.journal_type);
          setSlipCategory(j.slip_category);

          const debits = j.lines.filter((l) => l.side === "debit");
          const credits = j.lines.filter((l) => l.side === "credit");
          const maxLen = Math.max(debits.length, credits.length, INITIAL_ROWS);
          const newRows: RowData[] = [];
          for (let i = 0; i < maxLen; i++) {
            const d = debits[i];
            const c = credits[i];
            newRows.push({
              debit_account_id: d ? String(d.account_id) : "",
              debit_amount: d?.amount || "",
              debit_department_id: d?.department_id ? String(d.department_id) : "",
              debit_counterparty_id: d?.counterparty_id ? String(d.counterparty_id) : "",
              credit_account_id: c ? String(c.account_id) : "",
              credit_amount: c?.amount || "",
              credit_department_id: c?.department_id ? String(c.department_id) : "",
              credit_counterparty_id: c?.counterparty_id ? String(c.counterparty_id) : "",
              description: d?.description || c?.description || "",
            });
          }
          setRows(newRows);
        }
      })
      .catch(() => setError("伝票の読み込みに失敗しました"))
      .finally(() => setLoading(false));
  }, [editId]);

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
  const fmtUnit = (v: number, symbol: string, position: string) =>
    formatAmount(v, symbol, position, "0");

  // ── Balance calculation ──
  const debitTotal = rows.reduce((s, r) => s + (parseFloat(r.debit_amount) || 0), 0);
  const creditTotal = rows.reduce((s, r) => s + (parseFloat(r.credit_amount) || 0), 0);
  const isBalanced = debitTotal === creditTotal && debitTotal > 0;

  // ── Combobox options (use numeric id as value) ──
  const accountOptions: ComboOption[] = accounts.map((a) => ({
    value: String(a.id),
    label: `${a.code} ${a.name}`,
  }));
  const deptOptions: ComboOption[] = departments.map((d) => ({
    value: String(d.id),
    label: `${d.code} ${d.name}`,
  }));
  const cpOptions: ComboOption[] = counterparties.map((c) => ({
    value: String(c.id),
    label: `${c.code} ${c.name}`,
  }));

  // ── Submit ──
  const handleSubmit = async () => {
    setError(null);
    if (!postedDate || !fiscalPeriodId || !bookId) {
      setError("伝票日付、会計期間、帳簿は必須です");
      return;
    }
    if (!isBalanced) {
      setError("借方合計と貸方合計が一致しません");
      return;
    }

    const lines: {
      sort_order: number;
      side: string;
      account_id: number;
      amount: number;
      department_id?: number;
      counterparty_id?: number;
      description?: string;
    }[] = [];

    let group = 1;
    for (const row of rows) {
      const hasDebit = row.debit_account_id && parseFloat(row.debit_amount) > 0;
      const hasCredit = row.credit_account_id && parseFloat(row.credit_amount) > 0;

      if (hasDebit) {
        lines.push({
          sort_order: group,
          side: "debit",
          account_id: Number(row.debit_account_id),
          amount: parseFloat(row.debit_amount),
          department_id: row.debit_department_id ? Number(row.debit_department_id) : undefined,
          counterparty_id: row.debit_counterparty_id ? Number(row.debit_counterparty_id) : undefined,
          description: row.description || undefined,
        });
      }
      if (hasCredit) {
        lines.push({
          sort_order: group,
          side: "credit",
          account_id: Number(row.credit_account_id),
          amount: parseFloat(row.credit_amount),
          department_id: row.credit_department_id ? Number(row.credit_department_id) : undefined,
          counterparty_id: row.credit_counterparty_id ? Number(row.credit_counterparty_id) : undefined,
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
      if (editId) {
        // Update the first journal of the voucher
        const detail = await api.get<{ data: VoucherDetail }>(`/vouchers/${editId}`);
        const journalId = detail.data.journals[0]?.id;
        if (journalId) {
          await api.put(`/vouchers/${editId}/journals/${journalId}`, {
            journal_type: journalType,
            slip_category: slipCategory,
            description: headerDescription || undefined,
            lines,
          });
        }
      } else {
        await api.post("/vouchers", {
          idempotency_key: `web:${crypto.randomUUID()}`,
          fiscal_period_id: Number(fiscalPeriodId),
          posted_date: new Date(postedDate).toISOString(),
          description: headerDescription || undefined,
          journals: [
            {
              book_id: Number(bookId),
              journal_type: journalType,
              slip_category: slipCategory,
              description: headerDescription || undefined,
              lines,
            },
          ],
        });
      }
      onSuccess();
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存に失敗しました");
    } finally {
      setLoading(false);
    }
  };

  // ── One side (debit or credit) of a row ──
  const SideCell = ({ row, i, side }: { row: RowData; i: number; side: "debit" | "credit" }) => {
    const prefix = side;
    const acctId = row[`${prefix}_account_id`];
    const amount = row[`${prefix}_amount`];
    const deptId = row[`${prefix}_department_id`];
    const cpId = row[`${prefix}_counterparty_id`];

    return (
      <div className="divide-y divide-border">
        {/* Row 1: 部門 */}
        <MasterCombobox
          options={deptOptions}
          value={deptId}
          onValueChange={(v) => updateRow(i, `${prefix}_department_id`, v)}
          placeholder="部門"
        />
        {/* Row 2: 勘定科目 + 金額 */}
        <div className="flex items-center">
          <div className="flex-1 min-w-0">
            <MasterCombobox
              options={accountOptions}
              value={acctId}
              onValueChange={(v) => updateRow(i, `${prefix}_account_id`, v)}
              placeholder="勘定科目"
            />
          </div>
          <div className="flex items-center w-28 shrink-0 border-l border-border">
            <Input
              type="number"
              min="0"
              step="1"
              value={amount}
              onChange={(e) => updateRow(i, `${prefix}_amount`, e.target.value)}
              className="h-7 border-0 bg-transparent text-xs text-right shadow-none focus-visible:ring-0 flex-1"
            />
          </div>
        </div>
        {/* Row 3: 取引先 */}
        <MasterCombobox
          options={cpOptions}
          value={cpId}
          onValueChange={(v) => updateRow(i, `${prefix}_counterparty_id`, v)}
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
            editId ? "bg-yellow-600 text-white" : "bg-green-600 text-white"
          }`}
        >
          {editId ? "修正" : "新規"}
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

        {!editId && (
          <>
            {books.length > 1 && (
              <div className="flex items-center gap-1">
                <span className="text-xs text-muted-foreground">帳簿</span>
                <Select value={bookId} onValueChange={setBookId}>
                  <SelectTrigger className="w-32 h-8 text-xs">
                    <SelectValue placeholder="選択" />
                  </SelectTrigger>
                  <SelectContent>
                    {books.map((b) => (
                      <SelectItem key={b.id} value={String(b.id)}>
                        {b.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="flex items-center gap-1">
              <span className="text-xs text-muted-foreground">会計期間</span>
              <Select value={fiscalPeriodId} onValueChange={setFiscalPeriodId}>
                <SelectTrigger className="w-28 h-8 text-xs">
                  <SelectValue placeholder="選択" />
                </SelectTrigger>
                <SelectContent>
                  {fiscalPeriods.map((fp) => (
                    <SelectItem key={fp.id} value={String(fp.id)}>
                      {fp.code}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </>
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
                部門 / 勘定科目 / 取引先
              </th>
              <th className="border border-border px-2 py-1 text-center font-medium text-muted-foreground text-[10px]">
                部門 / 勘定科目 / 取引先
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} className="hover:bg-accent/10 align-top">
                <td className="border border-border px-1 py-2 text-center text-muted-foreground font-mono">
                  {i + 1}
                </td>
                <td className="border border-border p-0">
                  <SideCell row={row} i={i} side="debit" />
                </td>
                <td className="border border-border p-0">
                  <SideCell row={row} i={i} side="credit" />
                </td>
                <td className="border border-border p-0">
                  <textarea
                    value={row.description}
                    onChange={(e) => updateRow(i, "description", e.target.value)}
                    className="w-full h-full min-h-[5.5rem] resize-none border-0 bg-transparent px-2 py-1.5 text-xs outline-none focus:bg-accent/30"
                    placeholder="摘要"
                  />
                </td>
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
          <tfoot>
            <tr className="bg-muted/40 font-medium">
              <td className="border border-border" />
              <td className="border border-border px-2 py-1.5 text-right text-xs font-mono">
                借方合計
                {selectedBook?.unit_symbol && <span className="text-muted-foreground ml-1">({selectedBook.unit_symbol})</span>}
                <span className="ml-2">
                  {fmtUnit(debitTotal, selectedBook?.unit_symbol ?? "", selectedBook?.unit_position ?? "left")}
                </span>
              </td>
              <td className="border border-border px-2 py-1.5 text-right text-xs font-mono">
                貸方合計
                <span className="ml-2">
                  {fmtUnit(creditTotal, selectedBook?.unit_symbol ?? "", selectedBook?.unit_position ?? "left")}
                </span>
              </td>
              <td className="border border-border px-2 py-1.5 text-center text-xs">
                差額
                <span
                  className={`ml-2 font-mono ${debitTotal - creditTotal === 0 ? "text-green-400" : "text-red-400"}`}
                >
                  {fmtUnit(debitTotal - creditTotal, selectedBook?.unit_symbol ?? "", selectedBook?.unit_position ?? "left")}
                </span>
              </td>
              <td className="border border-border" />
            </tr>
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
