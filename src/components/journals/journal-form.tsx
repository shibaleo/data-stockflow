"use client";

import { useState, useEffect, useCallback, useRef, memo, useMemo } from "react";
import { Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { useEntityManager, randomCode, type EntityRow } from "@/hooks/use-entity-manager";

// ── Master data types ──

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

interface Department extends EntityRow {}

interface Counterparty extends EntityRow {}

interface TagRow extends EntityRow {
  tag_type: string;
}

interface VoucherTypeRow extends EntityRow {}

interface JournalTypeRow extends EntityRow {}

interface ProjectRow extends EntityRow {}

interface VoucherDetail {
  id: number;
  period_id: number;
  voucher_code: string | null;
  posted_date: string;
  description: string | null;
  journals: {
    id: number;
    book_id: number;
    revision: number;
    journal_type_id: number;
    voucher_type_id: number;
    project_id: number;
    adjustment_flag: string;
    description: string | null;
    metadata: Record<string, string>;
    lines: {
      side: string;
      account_id: number;
      department_id: number | null;
      counterparty_id: number | null;
      amount: string;
      description: string | null;
    }[];
    tags: { tag_id: number }[];
  }[];
}

// ── Row model (借方/貸方ペア) ──

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

// ── Journal section model ──

interface JournalSection {
  bookId: string;
  journalTypeId: string;
  projectId: string;
  description: string;
  tags: number[];
  metadata: Record<string, string>;
  rows: RowData[];
}

function emptySection(bookId: string, defaultJournalTypeId = "", defaultProjectId = ""): JournalSection {
  return {
    bookId,
    journalTypeId: defaultJournalTypeId,
    projectId: defaultProjectId,
    description: "",
    tags: [],
    metadata: {},
    rows: [{ ...EMPTY_ROW }],
  };
}


// ── AmountInput (blur時に3桁区切り、focus時に生数値) ──

function formatWithCommas(v: string): string {
  const n = parseFloat(v);
  if (isNaN(n) || v === "") return v;
  return n.toLocaleString("ja-JP");
}

function stripCommas(v: string): string {
  return v.replace(/,/g, "");
}

const AmountInput = memo(function AmountInput({
  amount,
  onAmountChange,
}: {
  amount: string;
  onAmountChange: (v: string) => void;
}) {
  const [focused, setFocused] = useState(false);
  const display = focused ? amount : formatWithCommas(amount);

  return (
    <div className="w-36 shrink-0 flex items-center justify-end">
      <textarea
        inputMode="decimal"
        value={display}
        onChange={(e) => onAmountChange(stripCommas(e.target.value))}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        className="w-full h-9 resize-none border-0 bg-transparent text-sm font-mono text-right px-2 py-2 outline-none focus:bg-accent/30"
        placeholder="数量"
        rows={1}
      />
    </div>
  );
});

// ── SideCell (memoized to prevent re-mount on parent re-render) ──

interface SideCellProps {
  bookId: string;
  acctId: string;
  amount: string;
  deptId: string;
  cpId: string;
  acctOptions: ComboOption[];
  deptOptions: ComboOption[];
  cpOptions: ComboOption[];
  onAcctChange: (v: string) => void;
  onAmountChange: (v: string) => void;
  onDeptChange: (v: string) => void;
  onCpChange: (v: string) => void;
  onCreateAcct?: (bookId: string, name: string) => Promise<string | null>;
  onRenameAcct?: (id: string, name: string) => Promise<boolean>;
  onCreateDept?: (name: string) => Promise<string | null>;
  onRenameDept?: (id: string, name: string) => Promise<boolean>;
  onCreateCp?: (name: string) => Promise<string | null>;
  onRenameCp?: (id: string, name: string) => Promise<boolean>;
}

const SideCell = memo(function SideCell({
  bookId,
  acctId,
  amount,
  deptId,
  cpId,
  acctOptions,
  deptOptions,
  cpOptions,
  onAcctChange,
  onAmountChange,
  onDeptChange,
  onCpChange,
  onCreateAcct,
  onRenameAcct,
  onCreateDept,
  onRenameDept,
  onCreateCp,
  onRenameCp,
}: SideCellProps) {
  const handleCreateAcct = useCallback(
    async (name: string) => onCreateAcct ? onCreateAcct(bookId, name) : null,
    [onCreateAcct, bookId]
  );
  return (
    <div className="divide-y divide-border">
      {/* 段1: 勘定科目 | 金額 */}
      <div className="flex">
        <div className="flex-1 min-w-0 border-r border-border">
          <MasterCombobox
            options={acctOptions}
            value={acctId}
            onValueChange={onAcctChange}
            placeholder="勘定科目"
            onCreate={onCreateAcct ? handleCreateAcct : undefined}
            onRename={onRenameAcct}
            className="h-9 text-sm"
          />
        </div>
        <AmountInput amount={amount} onAmountChange={onAmountChange} />
      </div>
      {/* 段2: 部門 | 取引先 */}
      <div className="flex items-center">
        <div className="flex-1 min-w-0 border-r border-border">
          <MasterCombobox
            options={deptOptions}
            value={deptId}
            onValueChange={onDeptChange}
            placeholder="部門"
            onCreate={onCreateDept}
            onRename={onRenameDept}
          />
        </div>
        <div className="flex-1 min-w-0">
          <MasterCombobox
            options={cpOptions}
            value={cpId}
            onValueChange={onCpChange}
            placeholder="取引先"
            onCreate={onCreateCp}
            onRename={onRenameCp}
          />
        </div>
      </div>
    </div>
  );
});

// ── Editable tag badge (double-click to rename) ──

function EditableTagBadge({
  tagId,
  allTags,
  onRemove,
  onRename,
}: {
  tagId: number;
  allTags: TagRow[];
  onRemove: () => void;
  onRename: (id: string, newName: string) => Promise<boolean>;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const t = allTags.find((tt) => Number(tt.id) === Number(tagId));

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const submit = async () => {
    if (text.trim() && text.trim() !== (t?.name ?? "")) {
      await onRename(String(tagId), text.trim());
    }
    setEditing(false);
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={submit}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); submit(); }
          if (e.key === "Escape") setEditing(false);
        }}
        className="h-7 w-20 rounded border border-primary/50 bg-transparent px-1.5 text-xs outline-none"
      />
    );
  }

  return (
    <Badge
      variant="secondary"
      className="h-7 text-xs px-1.5 py-0 gap-0.5 cursor-default"
      onDoubleClick={() => {
        setText(t?.name ?? "");
        setEditing(true);
      }}
    >
      {t?.name ?? `#${tagId}`}
      <button onClick={onRemove} className="ml-0.5 hover:text-destructive">
        <X className="size-2.5" />
      </button>
    </Badge>
  );
}

// ── Props ──

interface Props {
  editId: number | null;
  onSuccess: () => void;
  onCancel: () => void;
}

export function JournalForm({ editId, onSuccess, onCancel }: Props) {
  const [books, setBooks] = useState<BookRow[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [journalTypes, setJournalTypes] = useState<Record<string, JournalTypeRow[]>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Entity managers (auto-fetch + inline create/rename)
  const depts = useEntityManager<Department>({ endpoint: "/departments" });
  const cps = useEntityManager<Counterparty>({ endpoint: "/counterparties" });
  const tags = useEntityManager<TagRow>({ endpoint: "/tags", extraCreateFields: { tag_type: "general" } });
  const vts = useEntityManager<VoucherTypeRow>({ endpoint: "/voucher-types" });
  const projects = useEntityManager<ProjectRow>({ endpoint: "/projects" });

  // Voucher-level state
  const [postedDate, setPostedDate] = useState(new Date().toISOString().slice(0, 10));
  const [voucherTypeId, setVoucherTypeId] = useState("");
  const [headerDescription, setHeaderDescription] = useState("");

  // Journal sections
  const [journals, setJournals] = useState<JournalSection[]>([]);

  // Auto-select first voucher type
  useEffect(() => {
    if (vts.items.length > 0 && !voucherTypeId) {
      setVoucherTypeId(String(vts.items[0].id));
    }
  }, [vts.items, voucherTypeId]);

  // Default project ID for new sections
  const defaultProjectId = useMemo(
    () => projects.items.length > 0 ? String(projects.items[0].id) : "",
    [projects.items],
  );

  // ── Book-scoped data loading (accounts + journal types) ──
  useEffect(() => {
    (async () => {
      try {
        const booksRes = await api.get<{ data: BookRow[] }>("/books");
        const activeBooks = booksRes.data.filter((b) => b.is_active);
        setBooks(activeBooks);

        const [accountResults, jtResults] = await Promise.all([
          Promise.all(
            activeBooks.map((b) =>
              api.get<{ data: Account[] }>(`/books/${b.id}/accounts?limit=200`)
            )
          ),
          Promise.all(
            activeBooks.map((b) =>
              api.get<{ data: JournalTypeRow[] }>(`/books/${b.id}/journal-types`)
            )
          ),
        ]);

        const allAccounts = accountResults.flatMap((r) => r.data);
        setAccounts(Array.from(new Map(allAccounts.map((a) => [a.id, a])).values()));

        const jtMap: Record<string, JournalTypeRow[]> = {};
        activeBooks.forEach((b, i) => {
          jtMap[String(b.id)] = jtResults[i].data.filter((jt) => jt.is_active);
        });
        setJournalTypes(jtMap);

        const defaultBookId = activeBooks.length > 0 ? String(activeBooks[0].id) : "";
        const defaultJtId = jtMap[defaultBookId]?.[0]?.id ? String(jtMap[defaultBookId][0].id) : "";

        if (!editId) {
          setJournals([emptySection(defaultBookId, defaultJtId)]);
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
        setHeaderDescription(v.description || "");

        // Use voucher_type_id from first journal for voucher-level
        if (v.journals.length > 0) {
          setVoucherTypeId(String(v.journals[0].voucher_type_id));
        }

        const sections: JournalSection[] = v.journals.map((j) => {
          const debits = j.lines.filter((l) => l.side === "debit");
          const credits = j.lines.filter((l) => l.side === "credit");
          const maxLen = Math.max(debits.length, credits.length, 1);
          const rows: RowData[] = [];
          for (let i = 0; i < maxLen; i++) {
            const d = debits[i];
            const c = credits[i];
            rows.push({
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
          return {
            bookId: String(j.book_id),
            journalTypeId: String(j.journal_type_id),
            projectId: String(j.project_id),
            description: j.description || "",
            tags: j.tags.map((t) => t.tag_id),
            metadata: j.metadata ?? {},
            rows,
          };
        });
        setJournals(sections.length > 0 ? sections : [emptySection("")]);
      })
      .catch(() => setError("伝票の読み込みに失敗しました"))
      .finally(() => setLoading(false));
  }, [editId]);

  // ── Journal section helpers ──
  const updateSection = useCallback(
    (ji: number, patch: Partial<JournalSection>) => {
      setJournals((prev) => prev.map((s, i) => (i === ji ? { ...s, ...patch } : s)));
    },
    []
  );

  const updateRow = useCallback(
    (ji: number, ri: number, field: keyof RowData, value: string) => {
      setJournals((prev) =>
        prev.map((s, i) =>
          i === ji
            ? { ...s, rows: s.rows.map((r, j) => (j === ri ? { ...r, [field]: value } : r)) }
            : s
        )
      );
    },
    []
  );

  const addRow = useCallback((ji: number) => {
    setJournals((prev) =>
      prev.map((s, i) => (i === ji ? { ...s, rows: [...s.rows, { ...EMPTY_ROW }] } : s))
    );
  }, []);

  const removeRow = useCallback((ji: number, ri: number) => {
    setJournals((prev) =>
      prev.map((s, i) => (i === ji ? { ...s, rows: s.rows.filter((_, j) => j !== ri) } : s))
    );
  }, []);

  const addJournal = () => {
    const defaultBookId = books.length > 0 ? String(books[0].id) : "";
    const defaultJtId = journalTypes[defaultBookId]?.[0]?.id ? String(journalTypes[defaultBookId][0].id) : "";
    setJournals((prev) => [...prev, emptySection(defaultBookId, defaultJtId, defaultProjectId)]);
  };

  const removeJournal = (ji: number) => {
    setJournals((prev) => prev.filter((_, i) => i !== ji));
  };

  const addTag = useCallback((ji: number, tagId: number) => {
    setJournals((prev) =>
      prev.map((s, i) =>
        i === ji && !s.tags.includes(tagId) ? { ...s, tags: [...s.tags, tagId] } : s
      )
    );
  }, []);

  const removeTag = useCallback((ji: number, tagId: number) => {
    setJournals((prev) =>
      prev.map((s, i) => (i === ji ? { ...s, tags: s.tags.filter((t) => t !== tagId) } : s))
    );
  }, []);

  // ── Combobox options (tags show name only) ──
  const tagOptions: ComboOption[] = useMemo(
    () => tags.items.map((t) => ({ value: String(t.id), label: t.name })),
    [tags.items],
  );

  // ── Account create / rename (book-scoped, needs bookId arg) ──

  const createAccount = useCallback(
    async (bookId: string, name: string): Promise<string | null> => {
      try {
        const res = await api.post<{ data: Account }>(`/books/${bookId}/accounts`, {
          code: randomCode(),
          name,
          account_type: "expense",
        });
        setAccounts((prev) => [...prev, res.data]);
        return String(res.data.id);
      } catch {
        return null;
      }
    },
    [],
  );

  const renameAccount = useCallback(
    async (id: string, newName: string): Promise<boolean> => {
      try {
        const acct = accounts.find((a) => String(a.id) === id);
        if (!acct) return false;
        await api.put(`/books/${acct.book_id}/accounts/${id}`, { name: newName });
        setAccounts((prev) =>
          prev.map((a) => (String(a.id) === id ? { ...a, name: newName } : a)),
        );
        return true;
      } catch {
        return false;
      }
    },
    [accounts],
  );

  // ── Balance ──
  const sectionTotals = (sec: JournalSection) => {
    const dt = sec.rows.reduce((s, r) => s + (parseFloat(r.debit_amount) || 0), 0);
    const ct = sec.rows.reduce((s, r) => s + (parseFloat(r.credit_amount) || 0), 0);
    return { dt, ct };
  };

  const allBalanced = journals.every((sec) => {
    const { dt, ct } = sectionTotals(sec);
    return dt === ct && dt > 0;
  });

  // ── Helpers ──
  const getBook = (bookId: string) => books.find((b) => String(b.id) === bookId) ?? null;
  const fmtUnit = (v: number, book: BookRow | null) =>
    formatAmount(v, book?.unit_symbol ?? "", book?.unit_position ?? "left", "0");

  const bookAccountOptions = useCallback(
    (bookId: string): ComboOption[] => {
      return accounts
        .filter((a) => String(a.book_id) === bookId)
        .map((a) => ({ value: String(a.id), label: `${a.code} ${a.name}`, displayLabel: a.name }));
    },
    [accounts]
  );

  // ── Submit ──
  const handleSubmit = async () => {
    setError(null);
    if (!postedDate) {
      setError("伝票日付は必須です");
      return;
    }
    if (!voucherTypeId) {
      setError("伝票種別を選択してください");
      return;
    }
    // Validate amounts are valid numbers
    for (const sec of journals) {
      for (const row of sec.rows) {
        for (const side of ["debit", "credit"] as const) {
          const amt = row[`${side}_amount`];
          if (amt && (isNaN(Number(amt)) || Number(amt) < 0)) {
            setError(`金額が不正です: "${amt}"`);
            return;
          }
        }
      }
    }
    if (!allBalanced) {
      setError("各仕訳の借方合計と貸方合計が一致しません");
      return;
    }
    for (const sec of journals) {
      if (!sec.bookId) {
        setError("帳簿を選択してください");
        return;
      }
    }

    setLoading(true);
    try {
      if (editId) {
        const detail = await api.get<{ data: VoucherDetail }>(`/vouchers/${editId}`);
        const journalId = detail.data.journals[0]?.id;
        if (journalId) {
          const sec = journals[0];
          await api.put(`/vouchers/${editId}/journals/${journalId}`, {
            book_id: Number(sec.bookId),
            journal_type_id: Number(sec.journalTypeId),
            voucher_type_id: Number(voucherTypeId),
            project_id: Number(sec.projectId) || undefined,
            description: sec.description || undefined,
            metadata: Object.keys(sec.metadata).length > 0 ? sec.metadata : undefined,
            lines: buildLines(sec),
            tags: sec.tags.length > 0 ? sec.tags : undefined,
          });
        }
      } else {
        await api.post("/vouchers", {
          idempotency_key: `web:${crypto.randomUUID()}`,
          posted_date: new Date(postedDate).toISOString(),
          description: headerDescription || undefined,
          journals: journals.map((sec) => ({
            book_id: Number(sec.bookId),
            journal_type_id: Number(sec.journalTypeId),
            voucher_type_id: Number(voucherTypeId),
            project_id: Number(sec.projectId) || undefined,
            description: sec.description || undefined,
            metadata: Object.keys(sec.metadata).length > 0 ? sec.metadata : undefined,
            lines: buildLines(sec),
            tags: sec.tags.length > 0 ? sec.tags : undefined,
          })),
        });
      }
      onSuccess();
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存に失敗しました");
    } finally {
      setLoading(false);
    }
  };

  // SideCell is extracted as a memo component above

  return (
    <div className="flex flex-col h-full">
      {/* ── 上部ヘッダバー ── */}
      <div className="flex flex-wrap items-center gap-3 border-b border-border bg-card px-4 py-2">
        <span
          className={`rounded px-2 py-0.5 text-xs font-bold ${
            editId ? "bg-yellow-600 text-white" : "bg-green-600 text-white"
          }`}
        >
          {editId ? "修正" : "新規"}
        </span>

        <div className="flex items-center gap-1">
          <span className="text-xs text-muted-foreground">伝票日付</span>
          <Input
            type="date"
            value={postedDate}
            onChange={(e) => setPostedDate(e.target.value)}
            className="w-36 h-8 text-xs"
          />
        </div>

        <div className="flex items-center gap-1">
          <span className="text-xs text-muted-foreground">伝票種別</span>
          <div className="w-32">
            <MasterCombobox
              options={vts.comboOptions}
              value={voucherTypeId}
              onValueChange={setVoucherTypeId}
              placeholder="伝票種別"
              onCreate={vts.create}
              onRename={vts.rename}
              className="h-8 text-xs"
            />
          </div>
        </div>

        <div className="flex items-center gap-1 flex-1 min-w-0">
          <span className="text-xs text-muted-foreground shrink-0">摘要</span>
          <Input
            value={headerDescription}
            onChange={(e) => setHeaderDescription(e.target.value)}
            placeholder="伝票全体の摘要"
            className="h-8 text-xs"
          />
        </div>

        <div className="flex gap-2 shrink-0">
          <Button variant="outline" size="sm" onClick={onCancel} disabled={loading}>
            キャンセル
          </Button>
          <Button size="sm" onClick={handleSubmit} disabled={loading || !allBalanced}>
            {loading ? "保存中..." : "登録"}
          </Button>
        </div>
      </div>

      {error && (
        <div className="px-4 py-1.5 bg-destructive/10 text-destructive text-xs">
          {error}
        </div>
      )}

      {/* ── Journal sections ── */}
      <div className="flex-1 overflow-auto">
        {journals.map((sec, ji) => {
          const book = getBook(sec.bookId);
          const { dt, ct } = sectionTotals(sec);
          const balanced = dt === ct && dt > 0;

          return (
            <div key={ji} className="border-b border-border">
              {/* Journal header */}
              <div className="flex flex-wrap items-center gap-2 px-4 py-2 bg-muted/30">
                <span className="text-xs font-semibold text-muted-foreground">
                  仕訳 #{ji + 1}
                </span>

                <div className="flex items-center gap-1">
                  <span className="text-xs text-muted-foreground">帳簿</span>
                  <Select
                    value={sec.bookId}
                    onValueChange={(v) => updateSection(ji, { bookId: v })}
                  >
                    <SelectTrigger className="w-32 h-7 text-xs">
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

                <div className="w-32">
                  <MasterCombobox
                    options={(journalTypes[sec.bookId] ?? []).map((jt) => ({
                      value: String(jt.id),
                      label: `${jt.code} ${jt.name}`,
                      displayLabel: jt.name,
                    }))}
                    value={sec.journalTypeId}
                    onValueChange={(v) => updateSection(ji, { journalTypeId: v })}
                    placeholder="仕訳種別"
                    onCreate={sec.bookId ? async (name) => {
                      try {
                        const res = await api.post<{ data: JournalTypeRow }>(
                          `/books/${sec.bookId}/journal-types`,
                          { code: randomCode(), name },
                        );
                        setJournalTypes((prev) => ({
                          ...prev,
                          [sec.bookId]: [...(prev[sec.bookId] ?? []), res.data],
                        }));
                        return String(res.data.id);
                      } catch { return null; }
                    } : undefined}
                    onRename={sec.bookId ? async (id, newName) => {
                      try {
                        await api.put(`/books/${sec.bookId}/journal-types/${id}`, { name: newName });
                        setJournalTypes((prev) => ({
                          ...prev,
                          [sec.bookId]: (prev[sec.bookId] ?? []).map((jt) =>
                            String(jt.id) === id ? { ...jt, name: newName } : jt,
                          ),
                        }));
                        return true;
                      } catch { return false; }
                    } : undefined}
                    className="h-7 text-xs"
                  />
                </div>

                <div className="w-32">
                  <MasterCombobox
                    options={projects.comboOptions}
                    value={sec.projectId}
                    onValueChange={(v) => updateSection(ji, { projectId: v })}
                    placeholder="プロジェクト"
                    onCreate={projects.create}
                    onRename={projects.rename}
                    className="h-7 text-xs"
                  />
                </div>

                {/* Tags */}
                <div className="flex items-center gap-1 flex-wrap ml-auto">
                  {sec.tags.map((tagId) => (
                    <EditableTagBadge
                      key={tagId}
                      tagId={tagId}
                      allTags={tags.items}
                      onRemove={() => removeTag(ji, tagId)}
                      onRename={tags.rename}
                    />
                  ))}
                  <div className="w-40">
                    <MasterCombobox
                      options={tagOptions.filter((o) => !sec.tags.includes(Number(o.value)))}
                      value=""
                      onValueChange={(v) => {
                        if (v) addTag(ji, Number(v));
                      }}
                      placeholder="+ タグ"
                      className="h-7 text-xs"
                      onCreate={async (name) => {
                        const id = await tags.create(name);
                        if (id) addTag(ji, Number(id));
                        return null;
                      }}
                    />
                  </div>
                  {journals.length > 1 && (
                    <button
                      onClick={() => removeJournal(ji)}
                      className="text-muted-foreground hover:text-destructive ml-1"
                      title="この仕訳を削除"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {/* Metadata key-value editor */}
              {(Object.keys(sec.metadata).length > 0 || true) && (
                <div className="flex flex-wrap items-center gap-2 px-4 py-1.5 bg-muted/15 border-b border-border/30">
                  <span className="text-[10px] text-muted-foreground shrink-0">属性</span>
                  {Object.entries(sec.metadata).map(([k, v]) => (
                    <div key={k} className="flex items-center gap-0.5">
                      <Input
                        value={k}
                        onChange={(e) => {
                          const newMeta = { ...sec.metadata };
                          const val = newMeta[k];
                          delete newMeta[k];
                          newMeta[e.target.value] = val;
                          updateSection(ji, { metadata: newMeta });
                        }}
                        className="h-6 w-20 text-[10px] font-mono px-1"
                        placeholder="key"
                      />
                      <span className="text-[10px] text-muted-foreground">=</span>
                      <Input
                        value={v}
                        onChange={(e) => {
                          updateSection(ji, { metadata: { ...sec.metadata, [k]: e.target.value } });
                        }}
                        className="h-6 w-24 text-[10px] px-1"
                        placeholder="value"
                      />
                      <button
                        onClick={() => {
                          const newMeta = { ...sec.metadata };
                          delete newMeta[k];
                          updateSection(ji, { metadata: newMeta });
                        }}
                        className="text-muted-foreground hover:text-destructive"
                      >
                        <X className="size-2.5" />
                      </button>
                    </div>
                  ))}
                  <button
                    onClick={() => {
                      const newKey = `key${Object.keys(sec.metadata).length + 1}`;
                      updateSection(ji, { metadata: { ...sec.metadata, [newKey]: "" } });
                    }}
                    className="h-6 px-1.5 rounded border border-dashed border-border text-[10px] text-muted-foreground hover:text-foreground hover:border-foreground transition-colors"
                  >
                    + 属性追加
                  </button>
                </div>
              )}

              {/* Grid table */}
              <table className="w-full border-collapse text-xs" style={{ tableLayout: "fixed" }}>
                <colgroup>
                  <col style={{ width: "3%" }} />
                  <col style={{ width: "40%" }} />
                  <col style={{ width: "40%" }} />
                  <col style={{ width: "14%" }} />
                  <col style={{ width: "3%" }} />
                </colgroup>
                <thead className="sticky top-0 z-10">
                  <tr className="bg-muted/60">
                    <th className="border border-border px-1 py-1 text-center font-medium">
                      行
                    </th>
                    <th className="border border-border px-2 py-1 text-center font-medium bg-blue-900/30">
                      借方
                    </th>
                    <th className="border border-border px-2 py-1 text-center font-medium bg-blue-900/30">
                      貸方
                    </th>
                    <th className="border border-border px-2 py-1 text-center font-medium">
                      摘要
                    </th>
                    <th className="border border-border px-1 py-1" />
                  </tr>
                </thead>
                <tbody>
                  {sec.rows.map((row, ri) => (
                    <tr key={ri} className="hover:bg-accent/10 align-top">
                      <td className="border border-border px-1 py-2 text-center text-muted-foreground font-mono">
                        {ri + 1}
                      </td>
                      <td className="border border-border p-0">
                        <SideCell
                          acctId={row.debit_account_id}
                          amount={row.debit_amount}
                          deptId={row.debit_department_id}
                          cpId={row.debit_counterparty_id}
                          acctOptions={bookAccountOptions(sec.bookId)}
                          deptOptions={depts.comboOptions}
                          cpOptions={cps.comboOptions}

                          onAcctChange={(v) => updateRow(ji, ri, "debit_account_id", v)}
                          onAmountChange={(v) => updateRow(ji, ri, "debit_amount", v)}
                          onDeptChange={(v) => updateRow(ji, ri, "debit_department_id", v)}
                          onCpChange={(v) => updateRow(ji, ri, "debit_counterparty_id", v)}
                          bookId={sec.bookId}
                          onCreateAcct={createAccount}
                          onRenameAcct={renameAccount}
                          onCreateDept={depts.create}
                          onRenameDept={depts.rename}
                          onCreateCp={cps.create}
                          onRenameCp={cps.rename}
                        />
                      </td>
                      <td className="border border-border p-0">
                        <SideCell
                          acctId={row.credit_account_id}
                          amount={row.credit_amount}
                          deptId={row.credit_department_id}
                          cpId={row.credit_counterparty_id}
                          acctOptions={bookAccountOptions(sec.bookId)}
                          deptOptions={depts.comboOptions}
                          cpOptions={cps.comboOptions}

                          onAcctChange={(v) => updateRow(ji, ri, "credit_account_id", v)}
                          onAmountChange={(v) => updateRow(ji, ri, "credit_amount", v)}
                          onDeptChange={(v) => updateRow(ji, ri, "credit_department_id", v)}
                          onCpChange={(v) => updateRow(ji, ri, "credit_counterparty_id", v)}
                          bookId={sec.bookId}
                          onCreateAcct={createAccount}
                          onRenameAcct={renameAccount}
                          onCreateDept={depts.create}
                          onRenameDept={depts.rename}
                          onCreateCp={cps.create}
                          onRenameCp={cps.rename}
                        />
                      </td>
                      <td className="border border-border p-0">
                        <textarea
                          value={row.description}
                          onChange={(e) => updateRow(ji, ri, "description", e.target.value)}
                          className="w-full h-full min-h-[4.5rem] resize-none border-0 bg-transparent px-2 py-1.5 text-xs outline-none focus:bg-accent/30"
                          placeholder="摘要"
                        />
                      </td>
                      <td className="border border-border p-0.5 text-center align-top">
                        <button
                          onClick={() => removeRow(ji, ri)}
                          disabled={sec.rows.length <= 1}
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
                    <td className="border border-border px-1 py-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => addRow(ji)}
                        className="h-6 px-1 text-[10px]"
                      >
                        <Plus className="size-3" />
                      </Button>
                    </td>
                    <td className="border border-border px-2 py-1 text-right text-xs font-mono">
                      借方 {fmtUnit(dt, book)}
                    </td>
                    <td className="border border-border px-2 py-1 text-right text-xs font-mono">
                      貸方 {fmtUnit(ct, book)}
                    </td>
                    <td className="border border-border px-2 py-1 text-center text-xs">
                      差額{" "}
                      <span className={`font-mono ${balanced ? "text-green-400" : "text-red-400"}`}>
                        {fmtUnit(dt - ct, book)}
                      </span>
                    </td>
                    <td className="border border-border" />
                  </tr>
                </tfoot>
              </table>
            </div>
          );
        })}

        {/* Add journal section button */}
        {!editId && (
          <div className="px-4 py-3">
            <Button variant="outline" size="sm" onClick={addJournal}>
              <Plus className="size-3.5 mr-1" />
              仕訳グループ追加
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Build lines payload from a section ──

function buildLines(sec: JournalSection) {
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
  for (const row of sec.rows) {
    const hasDebit = row.debit_account_id && parseFloat(row.debit_amount) > 0;
    const hasCredit = row.credit_account_id && parseFloat(row.credit_amount) > 0;

    if (hasDebit) {
      lines.push({
        sort_order: group,
        side: "debit",
        account_id: Number(row.debit_account_id),
        amount: parseFloat(row.debit_amount),
        department_id: row.debit_department_id ? Number(row.debit_department_id) : undefined,
        counterparty_id: row.debit_counterparty_id
          ? Number(row.debit_counterparty_id)
          : undefined,
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
        counterparty_id: row.credit_counterparty_id
          ? Number(row.credit_counterparty_id)
          : undefined,
        description: hasDebit ? undefined : row.description || undefined,
      });
    }
    if (hasDebit || hasCredit) group++;
  }

  return lines;
}
