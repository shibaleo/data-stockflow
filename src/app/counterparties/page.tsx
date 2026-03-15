"use client";

import { useState, useEffect, useCallback } from "react";
import { Plus, Pencil, Trash2, RefreshCw, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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

interface CounterpartyRow {
  id: number;
  code: string;
  name: string;
  is_active: boolean;
  created_at: string;
}

type CPSortKey = "code" | "name" | "is_active";

const COLUMNS: [CPSortKey, string][] = [
  ["code", "コード"],
  ["name", "名前"],
  ["is_active", "状態"],
];

export default function CounterpartiesPage() {
  const [items, setItems] = useState<CounterpartyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);

  const { sorted, sortKey, sortDir, toggleSort } = useSort<CounterpartyRow, CPSortKey>(items, "code");

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<{ data: CounterpartyRow[] }>("/counterparties?limit=200");
      setItems(res.data);
    } catch (e) {
      const msg = e instanceof ApiError ? e.body.error : "取引先の取得に失敗しました";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  const handleCreate = () => { setEditId(null); setDialogOpen(true); };
  const handleEdit = (id: number) => { setEditId(id); setDialogOpen(true); };

  const handleDelete = async (id: number) => {
    if (!confirm("この取引先を無効化しますか？")) return;
    try {
      await api.delete(`/counterparties/${id}`);
      toast.success("取引先を無効化しました");
      fetchItems();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.body.error : "無効化に失敗しました");
    }
  };

  const handleRestore = async (id: number) => {
    try {
      await api.post(`/counterparties/${id}/restore`, {});
      toast.success("取引先を復元しました");
      fetchItems();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.body.error : "復元に失敗しました");
    }
  };

  const handleSuccess = () => {
    toast.success(editId ? "取引先を更新しました" : "取引先を作成しました");
    setDialogOpen(false);
    fetchItems();
  };

  return (
    <div className="p-4 md:p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold">取引先</h2>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={fetchItems}>
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button size="sm" onClick={handleCreate}>
            <Plus className="h-4 w-4 mr-1" />
            新規作成
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12 text-muted-foreground">読み込み中...</div>
      ) : sorted.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">取引先がありません</div>
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
                <th className="pb-3 font-medium w-28">操作</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((cp) => (
                <tr
                  key={cp.id}
                  className={`border-b border-border/50 hover:bg-accent/30 transition-colors ${!cp.is_active ? "opacity-50" : ""}`}
                >
                  <td className="py-3 pr-4 font-mono text-xs">{cp.code}</td>
                  <td className="py-3 pr-4">{cp.name}</td>
                  <td className="py-3 pr-4">
                    {cp.is_active ? (
                      <Badge className="bg-green-900/30 text-green-400 border-green-800/50">有効</Badge>
                    ) : (
                      <Badge className="bg-red-900/30 text-red-400 border-red-800/50">無効</Badge>
                    )}
                  </td>
                  <td className="py-3">
                    <div className="flex gap-1">
                      {cp.is_active ? (
                        <>
                          <Button variant="ghost" size="icon" onClick={() => handleEdit(cp.id)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => handleDelete(cp.id)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </>
                      ) : (
                        <Button variant="ghost" size="icon" onClick={() => handleRestore(cp.id)}>
                          <Undo2 className="h-4 w-4 text-green-400" />
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Button className="fixed bottom-6 right-6 h-14 w-14 rounded-full shadow-lg" size="icon" onClick={handleCreate}>
        <Plus className="h-6 w-6" />
      </Button>

      <CounterpartyDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editId={editId}
        items={items}
        onSuccess={handleSuccess}
      />
    </div>
  );
}

function CounterpartyDialog({
  open,
  onOpenChange,
  editId,
  items,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editId: number | null;
  items: CounterpartyRow[];
  onSuccess: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");

  useEffect(() => {
    if (!open) { setCode(""); setName(""); setError(null); return; }
    if (!editId) return;
    const existing = items.find((c) => c.id === editId);
    if (existing) { setCode(existing.code); setName(existing.name); }
  }, [open, editId, items]);

  const handleSubmit = async () => {
    setError(null);
    if (!code.trim() || !name.trim()) { setError("コードと名前は必須です"); return; }
    setLoading(true);
    try {
      const payload = { code: code.trim(), name: name.trim() };
      if (editId) {
        await api.put(`/counterparties/${editId}`, payload);
      } else {
        await api.post("/counterparties", payload);
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
          <DialogTitle>{editId ? "取引先の編集" : "取引先の新規作成"}</DialogTitle>
          <DialogDescription>
            {editId ? "取引先を更新します" : "新しい取引先を作成します"}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>コード</Label>
            <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="例: vendor-001" className="font-mono" />
          </div>
          <div className="space-y-2">
            <Label>名前</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="例: 株式会社サンプル" />
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
