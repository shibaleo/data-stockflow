"use client";

import { useState, useEffect } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { MasterCombobox } from "./master-combobox";
import { JournalLineRow, type LineData } from "./journal-line-row";
import { api } from "@/lib/api-client";
import { useEntityManager, type EntityRow } from "@/hooks/use-entity-manager";

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
  name: string;
}

interface VoucherTypeRow extends EntityRow {}
interface JournalTypeRow extends EntityRow {}

interface JournalDetail {
  idempotency_code: string;
  posted_date: string;
  journal_type_id: number;
  voucher_type_id: number;
  description: string | null;
  lines: {
    side: string;
    account_code: string;
    amount: string;
    description: string | null;
  }[];
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editCode: string | null; // null = create mode
  onSuccess: () => void;
}

const EMPTY_LINE: LineData = {
  side: "debit",
  account_code: "",
  amount: "",
  description: "",
};

export function JournalDialog({
  open,
  onOpenChange,
  editCode,
  onSuccess,
}: Props) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Entity managers
  const vts = useEntityManager<VoucherTypeRow>({ endpoint: open ? "/voucher-types" : null });
  const jts = useEntityManager<JournalTypeRow>({ endpoint: open ? "/books/general/journal-types" : null });

  // Form state
  const [postedDate, setPostedDate] = useState("");
  const [journalTypeId, setJournalTypeId] = useState("");
  const [voucherTypeId, setVoucherTypeId] = useState("");
  const [description, setDescription] = useState("");
  const [lines, setLines] = useState<LineData[]>([
    { ...EMPTY_LINE, side: "debit" },
    { ...EMPTY_LINE, side: "credit" },
  ]);

  // Auto-select first values
  useEffect(() => {
    if (vts.items.length > 0 && !voucherTypeId) {
      setVoucherTypeId(String(vts.items[0].id));
    }
  }, [vts.items, voucherTypeId]);

  useEffect(() => {
    if (jts.items.length > 0 && !journalTypeId) {
      setJournalTypeId(String(jts.items[0].id));
    }
  }, [jts.items, journalTypeId]);

  // Load master data (accounts from all active books)
  useEffect(() => {
    if (!open) return;
    (async () => {
      try {
        const booksRes = await api.get<{ data: BookRow[] }>("/books");
        const activeBooks = booksRes.data.filter((b) => b.is_active);

        const accountResults = await Promise.all(
          activeBooks.map((b) =>
            api.get<{ data: Account[] }>(`/books/${b.code}/accounts?limit=200`)
          )
        );

        const allAccounts = accountResults.flatMap((r) => r.data);
        setAccounts(Array.from(new Map(allAccounts.map((a) => [a.code, a])).values()));
      } catch {
        setError("マスタデータの読み込みに失敗しました");
      }
    })();
  }, [open]);

  // Load existing journal for edit mode
  useEffect(() => {
    if (!open || !editCode) return;
    setLoading(true);
    api
      .get<{ data: JournalDetail }>(`/journals/${editCode}`)
      .then((res) => {
        const j = res.data;
        setPostedDate(j.posted_date.slice(0, 10));
        setJournalTypeId(String(j.journal_type_id));
        setVoucherTypeId(String(j.voucher_type_id));
        setDescription(j.description || "");
        setLines(
          j.lines.map((l) => ({
            side: l.side as "debit" | "credit",
            account_code: l.account_code,
            amount: l.amount,
            description: l.description || "",
          }))
        );
      })
      .catch(() => setError("仕訳の読み込みに失敗しました"))
      .finally(() => setLoading(false));
  }, [open, editCode]);

  // Reset form when dialog closes
  useEffect(() => {
    if (!open) {
      setPostedDate("");
      setJournalTypeId("");
      setVoucherTypeId("");
      setDescription("");
      setLines([
        { ...EMPTY_LINE, side: "debit" },
        { ...EMPTY_LINE, side: "credit" },
      ]);
      setError(null);
    }
  }, [open]);

  const handleLineChange = (
    index: number,
    field: keyof LineData,
    value: string
  ) => {
    setLines((prev) =>
      prev.map((l, i) => (i === index ? { ...l, [field]: value } : l))
    );
  };

  const addLine = () => {
    setLines((prev) => [...prev, { ...EMPTY_LINE }]);
  };

  const removeLine = (index: number) => {
    setLines((prev) => prev.filter((_, i) => i !== index));
  };

  // Balance calculation
  const debitTotal = lines
    .filter((l) => l.side === "debit")
    .reduce((sum, l) => sum + (parseFloat(l.amount) || 0), 0);
  const creditTotal = lines
    .filter((l) => l.side === "credit")
    .reduce((sum, l) => sum + (parseFloat(l.amount) || 0), 0);
  const isBalanced = debitTotal === creditTotal && debitTotal > 0;

  const handleSubmit = async () => {
    setError(null);

    if (!postedDate) {
      setError("計上日は必須です");
      return;
    }

    if (!isBalanced) {
      setError("借方合計と貸方合計が一致しません");
      return;
    }

    const invalidLines = lines.some(
      (l) => !l.account_code || !l.amount || parseFloat(l.amount) <= 0
    );
    if (invalidLines) {
      setError("全行に勘定科目と正の金額を入力してください");
      return;
    }

    setLoading(true);
    try {
      const linePayload = lines.map((l, i) => ({
        sort_order: Math.floor(i / 2) + 1,
        side: l.side,
        account_code: l.account_code,
        amount: parseFloat(l.amount),
        description: l.description || undefined,
      }));

      if (editCode) {
        await api.put(`/journals/${editCode}`, {
          posted_date: new Date(postedDate).toISOString(),
          journal_type_id: Number(journalTypeId),
          voucher_type_id: Number(voucherTypeId),
          description: description || undefined,
          lines: linePayload,
        });
      } else {
        await api.post("/journals", {
          idempotency_code: `web:${crypto.randomUUID()}`,
          posted_date: new Date(postedDate).toISOString(),
          journal_type_id: Number(journalTypeId),
          voucher_type_id: Number(voucherTypeId),
          description: description || undefined,
          lines: linePayload,
        });
      }

      onSuccess();
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存に失敗しました");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            {editCode ? "仕訳の編集" : "新規仕訳"}
          </DialogTitle>
          <DialogDescription>
            {editCode
              ? "仕訳を更新します（新しいリビジョンが作成されます）"
              : "新しい仕訳を作成します"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Header fields */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>計上日</Label>
              <Input
                type="date"
                value={postedDate}
                onChange={(e) => setPostedDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>種別</Label>
              <MasterCombobox
                options={jts.comboOptions}
                value={journalTypeId}
                onValueChange={setJournalTypeId}
                placeholder="仕訳種別"
                onCreate={jts.create}
                onRename={jts.rename}
              />
            </div>
            <div className="space-y-2">
              <Label>伝票区分</Label>
              <MasterCombobox
                options={vts.comboOptions}
                value={voucherTypeId}
                onValueChange={setVoucherTypeId}
                placeholder="伝票種別"
                onCreate={vts.create}
                onRename={vts.rename}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>摘要</Label>
            <Input
              placeholder="取引の説明"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          {/* Journal lines */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>仕訳行</Label>
              <Button variant="outline" size="sm" onClick={addLine}>
                <Plus className="h-4 w-4 mr-1" />
                行追加
              </Button>
            </div>
            <div className="space-y-2">
              {lines.map((line, i) => (
                <JournalLineRow
                  key={i}
                  line={line}
                  index={i}
                  accounts={accounts}
                  onChange={handleLineChange}
                  onRemove={removeLine}
                  canRemove={lines.length > 2}
                />
              ))}
            </div>
          </div>

          {/* Balance indicator */}
          <div
            className={`flex justify-between rounded-md px-4 py-2 text-sm font-medium ${
              isBalanced
                ? "bg-green-900/20 text-green-400 border border-green-800/50"
                : "bg-red-900/20 text-red-400 border border-red-800/50"
            }`}
          >
            <span>
              借方: {debitTotal.toLocaleString()}
            </span>
            <span>{isBalanced ? "均衡" : "不均衡"}</span>
            <span>
              貸方: {creditTotal.toLocaleString()}
            </span>
          </div>

          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            キャンセル
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={loading || !isBalanced}
          >
            {loading ? "保存中..." : editCode ? "更新" : "作成"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
