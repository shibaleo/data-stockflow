"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Plus,
  Pencil,
  Trash2,
  RefreshCw,
  Undo2,
} from "lucide-react";
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

interface TagRow {
  id: number;
  code: string;
  name: string;
  tag_type: string;
  is_active: boolean;
  revision: number;
  created_at: string;
}

const TAG_TYPES = [
  { value: "label", label: "ラベル" },
  { value: "relationship", label: "人間関係" },
  { value: "source", label: "データ出自" },
] as const;

const TYPE_LABEL: Record<string, string> = {
  label: "ラベル",
  relationship: "人間関係",
  source: "データ出自",
};

const TYPE_COLOR: Record<string, string> = {
  label: "bg-blue-900/30 text-blue-400 border-blue-800/50",
  relationship: "bg-amber-900/30 text-amber-400 border-amber-800/50",
  source: "bg-cyan-900/30 text-cyan-400 border-cyan-800/50",
};

type TagSortKey = "code" | "name" | "tag_type" | "is_active";

const COLUMNS: [TagSortKey, string][] = [
  ["code", "コード"],
  ["name", "名前"],
  ["tag_type", "種別"],
  ["is_active", "状態"],
];

export default function TagsPage() {
  const [tags, setTags] = useState<TagRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [filterType, setFilterType] = useState<string>("__all__");

  const filtered = useMemo(
    () => tags.filter((t) => filterType === "__all__" || t.tag_type === filterType),
    [tags, filterType],
  );

  const { sorted, sortKey, sortDir, toggleSort } = useSort<TagRow, TagSortKey>(filtered, "tag_type");

  const fetchTags = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<{ data: TagRow[] }>("/tags?limit=200");
      setTags(res.data);
    } catch (e) {
      const msg =
        e instanceof ApiError ? e.body.error : "タグの取得に失敗しました";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTags();
  }, [fetchTags]);

  const handleCreate = () => {
    setEditId(null);
    setDialogOpen(true);
  };

  const handleEdit = (id: number) => {
    setEditId(id);
    setDialogOpen(true);
  };

  const handleDelete = async (id: number) => {
    if (!confirm("このタグを無効化しますか？")) return;
    try {
      await api.delete(`/tags/${id}`);
      toast.success("タグを無効化しました");
      fetchTags();
    } catch (e) {
      const msg =
        e instanceof ApiError ? e.body.error : "無効化に失敗しました";
      toast.error(msg);
    }
  };

  const handleRestore = async (id: number) => {
    try {
      await api.post(`/tags/${id}/restore`, {});
      toast.success("タグを復元しました");
      fetchTags();
    } catch (e) {
      const msg =
        e instanceof ApiError ? e.body.error : "復元に失敗しました";
      toast.error(msg);
    }
  };

  const handleSuccess = () => {
    toast.success(editId ? "タグを更新しました" : "タグを作成しました");
    setDialogOpen(false);
    fetchTags();
  };

  const typeCounts = tags.reduce<Record<string, number>>((acc, t) => {
    acc[t.tag_type] = (acc[t.tag_type] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className="p-4 md:p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold">タグ</h2>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={fetchTags}>
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button size="sm" onClick={handleCreate}>
            <Plus className="h-4 w-4 mr-1" />
            新規作成
          </Button>
        </div>
      </div>

      {/* Filter chips */}
      <div className="flex flex-wrap gap-2 mb-4">
        <button
          onClick={() => setFilterType("__all__")}
          className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium transition-colors ${
            filterType === "__all__"
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground hover:bg-accent"
          }`}
        >
          すべて ({tags.length})
        </button>
        {TAG_TYPES.map((t) => (
          <button
            key={t.value}
            onClick={() => setFilterType(t.value)}
            className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              filterType === t.value
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-accent"
            }`}
          >
            {t.label} ({typeCounts[t.value] || 0})
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-12 text-muted-foreground">
          読み込み中...
        </div>
      ) : sorted.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          タグがありません
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                {COLUMNS.map(([key, label]) => (
                  <th key={key} className="pb-3 pr-4 font-medium">
                    <SortHeader
                      column={key}
                      label={label}
                      sortKey={sortKey}
                      sortDir={sortDir}
                      onToggle={toggleSort}
                    />
                  </th>
                ))}
                <th className="pb-3 font-medium w-28">操作</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((t) => (
                <tr
                  key={t.id}
                  className={`border-b border-border/50 hover:bg-accent/30 transition-colors ${
                    !t.is_active ? "opacity-50" : ""
                  }`}
                >
                  <td className="py-3 pr-4 font-mono text-xs">{t.code}</td>
                  <td className="py-3 pr-4">{t.name}</td>
                  <td className="py-3 pr-4">
                    <Badge className={TYPE_COLOR[t.tag_type] || ""}>
                      {TYPE_LABEL[t.tag_type] || t.tag_type}
                    </Badge>
                  </td>
                  <td className="py-3 pr-4">
                    {t.is_active ? (
                      <Badge className="bg-green-900/30 text-green-400 border-green-800/50">有効</Badge>
                    ) : (
                      <Badge className="bg-red-900/30 text-red-400 border-red-800/50">無効</Badge>
                    )}
                  </td>
                  <td className="py-3">
                    <div className="flex gap-1">
                      {t.is_active ? (
                        <>
                          <Button variant="ghost" size="icon" onClick={() => handleEdit(t.id)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => handleDelete(t.id)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </>
                      ) : (
                        <Button variant="ghost" size="icon" onClick={() => handleRestore(t.id)}>
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

      <Button
        className="fixed bottom-6 right-6 h-14 w-14 rounded-full shadow-lg"
        size="icon"
        onClick={handleCreate}
      >
        <Plus className="h-6 w-6" />
      </Button>

      <TagDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editId={editId}
        tags={tags}
        onSuccess={handleSuccess}
      />
    </div>
  );
}

// ── Tag Dialog ──

function TagDialog({
  open,
  onOpenChange,
  editId,
  tags,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editId: number | null;
  tags: TagRow[];
  onSuccess: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [tagType, setTagType] = useState("label");

  useEffect(() => {
    if (!open) { setCode(""); setName(""); setTagType("label"); setError(null); return; }
    if (!editId) return;
    const existing = tags.find((t) => t.id === editId);
    if (existing) { setCode(existing.code); setName(existing.name); setTagType(existing.tag_type); }
  }, [open, editId, tags]);

  const handleSubmit = async () => {
    setError(null);
    if (!code.trim() || !name.trim()) { setError("コードと名前は必須です"); return; }
    setLoading(true);
    try {
      if (editId) {
        await api.put(`/tags/${editId}`, { code: code.trim(), name: name.trim(), tag_type: tagType });
      } else {
        await api.post("/tags", { code: code.trim(), name: name.trim(), tag_type: tagType });
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
          <DialogTitle>{editId ? "タグの編集" : "タグの新規作成"}</DialogTitle>
          <DialogDescription>
            {editId ? "タグを更新します" : "新しいタグを作成します"}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>コード</Label>
            <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="例: GROCERIES" className="font-mono" />
          </div>
          <div className="space-y-2">
            <Label>名前</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="例: 食料品" />
          </div>
          <div className="space-y-2">
            <Label>種別</Label>
            <Select value={tagType} onValueChange={setTagType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {TAG_TYPES.map((t) => (<SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>))}
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
