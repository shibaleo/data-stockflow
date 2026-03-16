"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Plus, Pencil, RefreshCw, Lock, Unlock, ShieldCheck, ChevronDown, ChevronRight } from "lucide-react";
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
import { api, ApiError, fetchAllPages } from "@/lib/api-client";

interface PeriodRow {
  id: number;
  code: string;
  name: string;
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

// ── Tree helpers ──

interface PeriodTreeNode {
  id: number;
  data: PeriodRow;
  children: PeriodTreeNode[];
  depth: number;
  hasChildren: boolean;
}

function buildPeriodTree(items: PeriodRow[]): PeriodTreeNode[] {
  const nodeMap = new Map<number, PeriodTreeNode>();
  for (const item of items) {
    nodeMap.set(item.id, { id: item.id, data: item, children: [], depth: 0, hasChildren: false });
  }
  const roots: PeriodTreeNode[] = [];
  for (const node of nodeMap.values()) {
    const parentId = node.data.parent_period_id;
    if (parentId && nodeMap.has(parentId)) {
      nodeMap.get(parentId)!.children.push(node);
      nodeMap.get(parentId)!.hasChildren = true;
    } else {
      roots.push(node);
    }
  }
  function sortAndSetDepth(nodes: PeriodTreeNode[], depth: number) {
    nodes.sort((a, b) => a.data.start_date.localeCompare(b.data.start_date));
    for (const n of nodes) { n.depth = depth; sortAndSetDepth(n.children, depth + 1); }
  }
  sortAndSetDepth(roots, 0);
  return roots;
}

function flattenPeriodTree(nodes: PeriodTreeNode[], collapsed: Set<number>): PeriodTreeNode[] {
  const result: PeriodTreeNode[] = [];
  function walk(list: PeriodTreeNode[]) {
    for (const n of list) {
      result.push(n);
      if (n.hasChildren && !collapsed.has(n.id)) walk(n.children);
    }
  }
  walk(nodes);
  return result;
}

function getDescendantIds(items: PeriodRow[], id: number): Set<number> {
  const result = new Set<number>([id]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const item of items) {
      if (item.parent_period_id && result.has(item.parent_period_id) && !result.has(item.id)) {
        result.add(item.id);
        changed = true;
      }
    }
  }
  return result;
}

export default function PeriodsPage() {
  const [periods, setPeriods] = useState<PeriodRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());

  const roots = useMemo(() => buildPeriodTree(periods), [periods]);
  const flatNodes = useMemo(() => flattenPeriodTree(roots, collapsed), [roots, collapsed]);

  const fetchPeriods = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchAllPages<PeriodRow>("/periods");
      setPeriods(data);
    } catch (e) {
      const msg = e instanceof ApiError ? e.body.error : "期間の取得に失敗しました";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchPeriods(); }, [fetchPeriods]);

  const handleCreate = () => { setEditId(null); setDialogOpen(true); };
  const handleEdit = (id: number) => { setEditId(id); setDialogOpen(true); };

  const handleSuccess = () => {
    toast.success(editId ? "期間を更新しました" : "期間を作成しました");
    setDialogOpen(false);
    fetchPeriods();
  };

  const toggleCollapse = (id: number) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleStatusAction = async (id: number, action: "close" | "reopen" | "finalize") => {
    const labels = { close: "締め", reopen: "再開", finalize: "確定" };
    try {
      await api.post(`/periods/${id}/${action}`, {});
      toast.success(`期間を${labels[action]}しました`);
      fetchPeriods();
    } catch (e) {
      const msg = e instanceof ApiError ? e.body.error : `${labels[action]}に失敗しました`;
      toast.error(msg);
    }
  };

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
                <th className="pb-3 pr-4 font-medium">名前</th>
                <th className="pb-3 pr-4 font-medium">コード</th>
                <th className="pb-3 pr-4 font-medium">期間</th>
                <th className="pb-3 pr-4 font-medium">ステータス</th>
                <th className="pb-3 font-medium w-32">操作</th>
              </tr>
            </thead>
            <tbody>
              {flatNodes.map((node) => {
                const p = node.data;
                return (
                  <tr key={p.id} className="border-b border-border/50 hover:bg-accent/30 transition-colors">
                    <td className="py-2 pr-4" style={{ paddingLeft: `${node.depth * 24 + 12}px` }}>
                      <div className="flex items-center">
                        {node.hasChildren ? (
                          <button onClick={() => toggleCollapse(p.id)} className="mr-1.5 w-4 text-center text-muted-foreground hover:text-foreground">
                            {collapsed.has(p.id) ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                          </button>
                        ) : node.depth > 0 ? (
                          <span className="mr-1.5 w-4 text-center text-muted-foreground/40">└</span>
                        ) : (
                          <span className="mr-1.5 w-4" />
                        )}
                        <span>{p.name}</span>
                      </div>
                    </td>
                    <td className="py-2 pr-4 font-mono text-xs">{p.code}</td>
                    <td className="py-2 pr-4">{formatDate(p.start_date)} ~ {formatDate(p.end_date)}</td>
                    <td className="py-2 pr-4">
                      <Badge className={STATUS_STYLE[p.status] || ""}>{STATUS_LABEL[p.status] || p.status}</Badge>
                    </td>
                    <td className="py-2">
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleEdit(p.id)} title="編集">
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        {p.status === "open" && (
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleStatusAction(p.id, "close")} title="締め">
                            <Lock className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        {p.status === "closed" && (
                          <>
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleStatusAction(p.id, "reopen")} title="再開">
                              <Unlock className="h-3.5 w-3.5" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleStatusAction(p.id, "finalize")} title="確定">
                              <ShieldCheck className="h-3.5 w-3.5" />
                            </Button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="fixed bottom-6 right-6">
        <Button className="h-14 w-14 rounded-full shadow-lg" size="icon" title="期間を作成" onClick={handleCreate}>
          <Plus className="h-6 w-6" />
        </Button>
      </div>

      <PeriodDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editId={editId}
        periods={periods}
        onSuccess={handleSuccess}
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
  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [parentId, setParentId] = useState<string>("none");

  // Exclude self and descendants from parent options
  const parentOptions = useMemo(() => {
    if (!editId) return periods.filter((p) => p.is_active);
    const excluded = getDescendantIds(periods, editId);
    return periods.filter((p) => p.is_active && !excluded.has(p.id));
  }, [periods, editId]);

  const selectedParent = parentId !== "none" ? periods.find((p) => p.id === Number(parentId)) : null;

  useEffect(() => {
    if (!open) { setCode(""); setName(""); setStartDate(""); setEndDate(""); setParentId("none"); setError(null); return; }
    if (!editId) return;
    const existing = periods.find((p) => p.id === editId);
    if (existing) {
      setCode(existing.code);
      setName(existing.name);
      setStartDate(existing.start_date.slice(0, 10));
      setEndDate(existing.end_date.slice(0, 10));
      setParentId(existing.parent_period_id ? String(existing.parent_period_id) : "none");
    }
  }, [open, editId, periods]);

  const handleSubmit = async () => {
    setError(null);
    if (!code.trim() || !name.trim() || !startDate || !endDate) {
      setError("コード、名前、開始日、終了日は必須です");
      return;
    }
    const sd = new Date(startDate);
    const ed = new Date(endDate);
    if (sd >= ed) { setError("終了日は開始日より後にしてください"); return; }

    // Client-side parent date range check
    if (selectedParent) {
      const ps = new Date(selectedParent.start_date);
      const pe = new Date(selectedParent.end_date);
      if (sd < ps || ed > pe) {
        setError(`親期間（${new Date(selectedParent.start_date).toLocaleDateString("ja-JP")} ~ ${new Date(selectedParent.end_date).toLocaleDateString("ja-JP")}）の範囲内にしてください`);
        return;
      }
    }

    setLoading(true);
    try {
      const payload: Record<string, unknown> = {
        code: code.trim(),
        name: name.trim(),
        start_date: sd.toISOString(),
        end_date: ed.toISOString(),
      };
      if (editId) {
        payload.parent_period_id = parentId === "none" ? null : Number(parentId);
        await api.put(`/periods/${editId}`, payload);
      } else {
        if (parentId !== "none") payload.parent_period_id = Number(parentId);
        payload.status = "open";
        await api.post(`/periods`, payload);
      }
      onSuccess();
    } catch (e) {
      setError(e instanceof ApiError ? e.body.error : e instanceof Error ? e.message : "保存に失敗しました");
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
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>コード</Label>
              <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="例: 2026-01" className="font-mono" />
            </div>
            <div className="space-y-2">
              <Label>名前</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="例: 2026年1月期" />
            </div>
          </div>
          <div className="space-y-2">
            <Label>親期間</Label>
            <Select value={parentId} onValueChange={setParentId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">なし</SelectItem>
                {parentOptions.map((p) => (
                  <SelectItem key={p.id} value={String(p.id)}>{p.name} ({p.code})</SelectItem>
                ))}
              </SelectContent>
            </Select>
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
          {selectedParent && (
            <p className="text-xs text-muted-foreground">
              親期間の範囲: {new Date(selectedParent.start_date).toLocaleDateString("ja-JP")} ~ {new Date(selectedParent.end_date).toLocaleDateString("ja-JP")}
            </p>
          )}
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
