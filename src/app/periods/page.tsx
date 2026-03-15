"use client";

import { useState, useEffect, useCallback } from "react";
import { Plus, Pencil, RefreshCw, CalendarPlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { SortHeader } from "@/components/shared/sort-header";
import { useSort } from "@/hooks/use-sort";
import { api, ApiError } from "@/lib/api-client";

interface PeriodRow {
  id: number;
  code: string;
  start_date: string;
  end_date: string;
  status: string;
  is_active: boolean;
  parent_period_id: number | null;
  revision: number;
  created_at: string;
}

const STATUS_LABEL: Record<string, string> = {
  open: "オープン",
  closed: "クローズ",
  finalized: "確定済",
};

const STATUS_STYLE: Record<string, string> = {
  open: "bg-green-900/30 text-green-400 border-green-800/50",
  closed: "bg-yellow-900/30 text-yellow-400 border-yellow-800/50",
  finalized: "bg-blue-900/30 text-blue-400 border-blue-800/50",
};

type PSortKey = "code" | "start_date" | "status";

const COLUMNS: [PSortKey, string][] = [
  ["code", "コード"],
  ["start_date", "期間"],
  ["status", "ステータス"],
];

export default function PeriodsPage() {
  const [periods, setPeriods] = useState<PeriodRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [bulkDialogOpen, setBulkDialogOpen] = useState(false);

  const { sorted, sortKey, sortDir, toggleSort } = useSort<PeriodRow, PSortKey>(periods, "start_date");

  const fetchPeriods = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<{ data: PeriodRow[] }>(`/periods?limit=200`);
      setPeriods(res.data);
    } catch (e) {
      const msg = e instanceof ApiError ? e.body.error : "期間の取得に失敗しました";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPeriods();
  }, [fetchPeriods]);

  const handleCreate = () => { setEditId(null); setDialogOpen(true); };
  const handleEdit = (id: number) => { setEditId(id); setDialogOpen(true); };

  const handleSuccess = () => {
    toast.success(editId ? "期間を更新しました" : "期間を作成しました");
    setDialogOpen(false);
    fetchPeriods();
  };

  const handleBulkSuccess = () => { setBulkDialogOpen(false); fetchPeriods(); };
  const formatDate = (iso: string) => new Date(iso).toLocaleDateString("ja-JP");

  return (
    <div className="p-4 md:p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold">期間</h2>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={fetchPeriods}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12 text-muted-foreground">読み込み中...</div>
      ) : periods.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">期間がありません</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                {COLUMNS.map(([key, label]) => (
                  <th key={key} className="pb-3 pr-4 font-medium">
                    <SortHeader column={key} label={label} sortKey={sortKey} sortDir={sortDir} onToggle={toggleSort} />
                  </th>
                ))}
                <th className="pb-3 font-medium w-20">操作</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((p) => (
                <tr key={p.id} className="border-b border-border/50 hover:bg-accent/30 transition-colors">
                  <td className="py-3 pr-4 font-mono text-xs">{p.code}</td>
                  <td className="py-3 pr-4">{formatDate(p.start_date)} ~ {formatDate(p.end_date)}</td>
                  <td className="py-3 pr-4">
                    <Badge className={STATUS_STYLE[p.status] || ""}>{STATUS_LABEL[p.status] || p.status}</Badge>
                  </td>
                  <td className="py-3">
                    <Button variant="ghost" size="icon" onClick={() => handleEdit(p.id)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="fixed bottom-6 right-6 flex flex-col gap-3">
        <Button className="h-12 w-12 rounded-full shadow-lg" variant="outline" size="icon" title="個別作成" onClick={handleCreate}>
          <Plus className="h-5 w-5" />
        </Button>
        <Button className="h-14 w-14 rounded-full shadow-lg" size="icon" title="年度一括作成" onClick={() => setBulkDialogOpen(true)}>
          <CalendarPlus className="h-6 w-6" />
        </Button>
      </div>

      <PeriodDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editId={editId}
        periods={periods}
        onSuccess={handleSuccess}
      />

      <BulkCreateDialog
        open={bulkDialogOpen}
        onOpenChange={setBulkDialogOpen}
        onSuccess={handleBulkSuccess}
      />
    </div>
  );
}

// ── Period Dialog ──

function PeriodDialog({
  open, onOpenChange, editId, periods, onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editId: number | null;
  periods: PeriodRow[];
  onSuccess: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [status, setStatus] = useState("open");

  useEffect(() => {
    if (!open) { setCode(""); setStartDate(""); setEndDate(""); setStatus("open"); setError(null); return; }
    if (!editId) return;
    const existing = periods.find((p) => p.id === editId);
    if (existing) {
      setCode(existing.code);
      setStartDate(existing.start_date.slice(0, 10));
      setEndDate(existing.end_date.slice(0, 10));
      setStatus(existing.status);
    }
  }, [open, editId, periods]);

  const handleSubmit = async () => {
    setError(null);
    if (!code.trim() || !startDate || !endDate) { setError("コード、開始日、終了日は必須です"); return; }
    if (new Date(startDate) >= new Date(endDate)) { setError("終了日は開始日より後にしてください"); return; }

    setLoading(true);
    try {
      if (editId) {
        await api.put(`/periods/${editId}`, {
          code: code.trim(),
          start_date: new Date(startDate).toISOString(),
          end_date: new Date(endDate).toISOString(),
          status,
        });
      } else {
        await api.post(`/periods`, {
          code: code.trim(),
          start_date: new Date(startDate).toISOString(),
          end_date: new Date(endDate).toISOString(),
          status,
        });
      }
      onSuccess();
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存に失敗しました");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{editId ? "期間の編集" : "期間の新規作成"}</DialogTitle>
          <DialogDescription>
            {editId ? "期間を更新します" : "新しい期間を作成します"}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>コード</Label>
            <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="例: 2026-01" className="font-mono" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>開始日</Label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>終了日</Label>
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
          </div>
          <div className="space-y-2">
            <Label>ステータス</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="open">オープン</SelectItem>
                <SelectItem value="closed">クローズ</SelectItem>
                <SelectItem value="finalized">確定済</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>キャンセル</Button>
          <Button onClick={handleSubmit} disabled={loading}>{loading ? "保存中..." : editId ? "更新" : "作成"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Bulk Create Dialog ──

function BulkCreateDialog({
  open, onOpenChange, onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fiscalYear, setFiscalYear] = useState("2026");
  const [startMonth, setStartMonth] = useState("4");
  const [progress, setProgress] = useState("");

  useEffect(() => { if (!open) { setError(null); setProgress(""); } }, [open]);

  const startMon = Number(startMonth);
  const year = Number(fiscalYear);
  const preview = Array.from({ length: 12 }, (_, i) => {
    const mon = ((startMon - 1 + i) % 12) + 1;
    const y = year + (startMon + i > 12 ? 1 : 0);
    const start = new Date(y, mon - 1, 1);
    const end = new Date(y, mon, 0);
    return { periodNo: i + 1, code: `${year}-${String(i + 1).padStart(2, "0")}`, start, end };
  });

  const handleSubmit = async () => {
    setError(null);
    if (!Number.isInteger(year) || year < 1900 || year > 2100) { setError("年度は1900~2100の整数で入力してください"); return; }
    setLoading(true);
    let created = 0;
    try {
      for (const p of preview) {
        setProgress(`${created + 1}/12 作成中...`);
        await api.post(`/periods`, {
          code: p.code, start_date: p.start.toISOString(), end_date: p.end.toISOString(), status: "open",
        });
        created++;
      }
      toast.success(`${created}件の期間を作成しました`);
      onSuccess();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "作成に失敗しました";
      setError(`${created}件作成後にエラー: ${msg}`);
    } finally {
      setLoading(false); setProgress("");
    }
  };

  const fmt = (d: Date) => d.toLocaleDateString("ja-JP");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>年度一括作成</DialogTitle>
          <DialogDescription>指定した年度・開始月から12ヶ月分の期間を一括作成します</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>年度</Label>
              <Input type="number" value={fiscalYear} onChange={(e) => setFiscalYear(e.target.value)} placeholder="2026" />
            </div>
            <div className="space-y-2">
              <Label>開始月</Label>
              <Select value={startMonth} onValueChange={setStartMonth}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 12 }, (_, i) => (
                    <SelectItem key={i + 1} value={String(i + 1)}>{i + 1}月</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="rounded-md border border-border overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border bg-muted/30 text-muted-foreground">
                  <th className="py-1.5 px-3 text-left font-medium">期</th>
                  <th className="py-1.5 px-3 text-left font-medium">コード</th>
                  <th className="py-1.5 px-3 text-left font-medium">期間</th>
                </tr>
              </thead>
              <tbody>
                {preview.map((p) => (
                  <tr key={p.periodNo} className="border-b border-border/50">
                    <td className="py-1 px-3">{p.periodNo}</td>
                    <td className="py-1 px-3 font-mono">{p.code}</td>
                    <td className="py-1 px-3">{fmt(p.start)} ~ {fmt(p.end)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {progress && <p className="text-sm text-muted-foreground">{progress}</p>}
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>キャンセル</Button>
          <Button onClick={handleSubmit} disabled={loading}>{loading ? progress || "作成中..." : "12ヶ月分を作成"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
