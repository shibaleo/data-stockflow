"use client";

import { useState, useEffect, useCallback } from "react";
import { Plus, Pencil, RefreshCw, ArrowUpDown, ArrowUp, ArrowDown, CalendarPlus } from "lucide-react";
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
import { api, ApiError } from "@/lib/api-client";

interface FiscalPeriodRow {
  code: string;
  display_code: string;
  fiscal_year: number;
  period_no: number;
  start_date: string;
  end_date: string;
  status: string;
  revision: number;
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

export default function FiscalPeriodsPage() {
  const [periods, setPeriods] = useState<FiscalPeriodRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editCode, setEditCode] = useState<string | null>(null);
  const [bulkDialogOpen, setBulkDialogOpen] = useState(false);

  type SortKey = "display_code" | "fiscal_year" | "period_no" | "start_date" | "status" | "revision";
  type SortDir = "asc" | "desc";
  const [sortKey, setSortKey] = useState<SortKey>("start_date");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const sortedPeriods = [...periods].sort((a, b) => {
    const dir = sortDir === "asc" ? 1 : -1;
    const va = a[sortKey];
    const vb = b[sortKey];
    if (typeof va === "string" && typeof vb === "string") return va.localeCompare(vb, "ja") * dir;
    if (typeof va === "number" && typeof vb === "number") return (va - vb) * dir;
    return 0;
  });

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return <ArrowUpDown className="h-3 w-3 ml-1 opacity-40" />;
    return sortDir === "asc"
      ? <ArrowUp className="h-3 w-3 ml-1" />
      : <ArrowDown className="h-3 w-3 ml-1" />;
  };

  const fetchPeriods = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<{ data: FiscalPeriodRow[] }>("/fiscal-periods?limit=200");
      setPeriods(res.data);
    } catch (e) {
      const msg = e instanceof ApiError ? e.body.error : "会計期間の取得に失敗しました";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPeriods();
  }, [fetchPeriods]);

  const handleCreate = () => {
    setEditCode(null);
    setDialogOpen(true);
  };

  const handleEdit = (code: string) => {
    setEditCode(code);
    setDialogOpen(true);
  };

  const handleSuccess = () => {
    toast.success(editCode ? "会計期間を更新しました" : "会計期間を作成しました");
    setDialogOpen(false);
    fetchPeriods();
  };

  const handleBulkSuccess = () => {
    setBulkDialogOpen(false);
    fetchPeriods();
  };

  const formatDate = (iso: string) => new Date(iso).toLocaleDateString("ja-JP");

  return (
    <div className="p-4 md:p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold">会計期間</h2>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={fetchPeriods}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12 text-muted-foreground">
          読み込み中...
        </div>
      ) : periods.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          会計期間がありません
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                {([
                  ["display_code", "コード"],
                  ["fiscal_year", "年度"],
                  ["period_no", "期"],
                  ["start_date", "開始日"],
                  ["status", "ステータス"],
                  ["revision", "Rev"],
                ] as [SortKey, string][]).map(([key, label]) => (
                  <th key={key} className="pb-3 pr-4 font-medium">
                    <button
                      className="inline-flex items-center hover:text-foreground transition-colors"
                      onClick={() => toggleSort(key)}
                    >
                      {label}
                      <SortIcon col={key} />
                    </button>
                  </th>
                ))}
                <th className="pb-3 font-medium w-20">操作</th>
              </tr>
            </thead>
            <tbody>
              {sortedPeriods.map((p) => (
                <tr
                  key={p.code}
                  className="border-b border-border/50 hover:bg-accent/30 transition-colors"
                >
                  <td className="py-3 pr-4 font-mono text-xs">{p.display_code}</td>
                  <td className="py-3 pr-4">{p.fiscal_year}</td>
                  <td className="py-3 pr-4">{p.period_no}</td>
                  <td className="py-3 pr-4">
                    {formatDate(p.start_date)} ~ {formatDate(p.end_date)}
                  </td>
                  <td className="py-3 pr-4">
                    <Badge className={STATUS_STYLE[p.status] || ""}>
                      {STATUS_LABEL[p.status] || p.status}
                    </Badge>
                  </td>
                  <td className="py-3 pr-4 text-muted-foreground">{p.revision}</td>
                  <td className="py-3">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleEdit(p.code)}
                    >
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
        <Button
          className="h-12 w-12 rounded-full shadow-lg"
          variant="outline"
          size="icon"
          title="個別作成"
          onClick={handleCreate}
        >
          <Plus className="h-5 w-5" />
        </Button>
        <Button
          className="h-14 w-14 rounded-full shadow-lg"
          size="icon"
          title="年度一括作成"
          onClick={() => setBulkDialogOpen(true)}
        >
          <CalendarPlus className="h-6 w-6" />
        </Button>
      </div>

      <FiscalPeriodDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editCode={editCode}
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

// ── Fiscal Period Dialog ──

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editCode: string | null;
  periods: FiscalPeriodRow[];
  onSuccess: () => void;
}

function FiscalPeriodDialog({
  open,
  onOpenChange,
  editCode,
  periods,
  onSuccess,
}: DialogProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [displayCode, setDisplayCode] = useState("");
  const [fiscalYear, setFiscalYear] = useState("");
  const [periodNo, setPeriodNo] = useState("1");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [status, setStatus] = useState("open");

  useEffect(() => {
    if (!open) {
      setDisplayCode("");
      setFiscalYear("");
      setPeriodNo("1");
      setStartDate("");
      setEndDate("");
      setStatus("open");
      setError(null);
      return;
    }
    if (!editCode) return;

    const existing = periods.find((p) => p.code === editCode);
    if (existing) {
      setDisplayCode(existing.display_code);
      setFiscalYear(String(existing.fiscal_year));
      setPeriodNo(String(existing.period_no));
      setStartDate(existing.start_date.slice(0, 10));
      setEndDate(existing.end_date.slice(0, 10));
      setStatus(existing.status);
    }
  }, [open, editCode, periods]);

  const handleSubmit = async () => {
    setError(null);

    if (!displayCode.trim() || !fiscalYear || !startDate || !endDate) {
      setError("コード、年度、開始日、終了日は必須です");
      return;
    }

    const year = Number(fiscalYear);
    const pno = Number(periodNo);
    if (!Number.isInteger(year) || year < 1900 || year > 2100) {
      setError("年度は1900~2100の整数で入力してください");
      return;
    }
    if (!Number.isInteger(pno) || pno < 1 || pno > 13) {
      setError("期は1~13の整数で入力してください");
      return;
    }

    if (new Date(startDate) >= new Date(endDate)) {
      setError("終了日は開始日より後にしてください");
      return;
    }

    setLoading(true);
    try {
      const payload = {
        display_code: displayCode.trim(),
        fiscal_year: year,
        period_no: pno,
        start_date: new Date(startDate).toISOString(),
        end_date: new Date(endDate).toISOString(),
        status,
      };

      if (editCode) {
        await api.put(`/fiscal-periods/${editCode}`, payload);
      } else {
        await api.post("/fiscal-periods", payload);
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
          <DialogTitle>
            {editCode ? "会計期間の編集" : "会計期間の新規作成"}
          </DialogTitle>
          <DialogDescription>
            {editCode
              ? "会計期間を更新します（新しいリビジョンが作成されます）"
              : "新しい会計期間を作成します"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>コード</Label>
            <Input
              value={displayCode}
              onChange={(e) => setDisplayCode(e.target.value)}
              placeholder="例: 2026-01"
              className="font-mono"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>年度</Label>
              <Input
                type="number"
                value={fiscalYear}
                onChange={(e) => setFiscalYear(e.target.value)}
                placeholder="例: 2026"
              />
            </div>
            <div className="space-y-2">
              <Label>期 (1~13)</Label>
              <Input
                type="number"
                min={1}
                max={13}
                value={periodNo}
                onChange={(e) => setPeriodNo(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>開始日</Label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>終了日</Label>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>ステータス</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
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
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            キャンセル
          </Button>
          <Button onClick={handleSubmit} disabled={loading}>
            {loading ? "保存中..." : editCode ? "更新" : "作成"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Bulk Create Dialog ──

function BulkCreateDialog({
  open,
  onOpenChange,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fiscalYear, setFiscalYear] = useState("2025");
  const [startMonth, setStartMonth] = useState("4");
  const [progress, setProgress] = useState("");

  useEffect(() => {
    if (!open) {
      setError(null);
      setProgress("");
    }
  }, [open]);

  // Preview: generate the 12 periods
  const startMon = Number(startMonth);
  const year = Number(fiscalYear);
  const preview = Array.from({ length: 12 }, (_, i) => {
    const mon = ((startMon - 1 + i) % 12) + 1;
    const y = year + (startMon + i > 12 ? 1 : 0);
    const start = new Date(y, mon - 1, 1);
    const end = new Date(y, mon, 0); // last day of month
    return {
      periodNo: i + 1,
      code: `${year}-${String(i + 1).padStart(2, "0")}`,
      start,
      end,
    };
  });

  const handleSubmit = async () => {
    setError(null);
    if (!Number.isInteger(year) || year < 1900 || year > 2100) {
      setError("年度は1900~2100の整数で入力してください");
      return;
    }

    setLoading(true);
    let created = 0;
    try {
      for (const p of preview) {
        setProgress(`${created + 1}/12 作成中...`);
        await api.post("/fiscal-periods", {
          display_code: p.code,
          fiscal_year: year,
          period_no: p.periodNo,
          start_date: p.start.toISOString(),
          end_date: p.end.toISOString(),
          status: "open",
        });
        created++;
      }
      toast.success(`${created}件の会計期間を作成しました`);
      onSuccess();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "作成に失敗しました";
      setError(`${created}件作成後にエラー: ${msg}`);
    } finally {
      setLoading(false);
      setProgress("");
    }
  };

  const fmt = (d: Date) => d.toLocaleDateString("ja-JP");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>年度一括作成</DialogTitle>
          <DialogDescription>
            指定した年度・開始月から12ヶ月分の会計期間を一括作成します
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>年度</Label>
              <Input
                type="number"
                value={fiscalYear}
                onChange={(e) => setFiscalYear(e.target.value)}
                placeholder="2025"
              />
            </div>
            <div className="space-y-2">
              <Label>開始月</Label>
              <Select value={startMonth} onValueChange={setStartMonth}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 12 }, (_, i) => (
                    <SelectItem key={i + 1} value={String(i + 1)}>
                      {i + 1}月
                    </SelectItem>
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
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            キャンセル
          </Button>
          <Button onClick={handleSubmit} disabled={loading}>
            {loading ? progress || "作成中..." : "12ヶ月分を作成"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
