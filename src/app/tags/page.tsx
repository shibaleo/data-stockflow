"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Plus,
  Pencil,
  Trash2,
  RefreshCw,
  Undo2,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
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
import { api, ApiError } from "@/lib/api-client";

interface TagRow {
  code: string;
  display_code: string;
  name: string;
  tag_type: string;
  is_active: boolean;
  revision: number;
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

export default function TagsPage() {
  const [tags, setTags] = useState<TagRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editCode, setEditCode] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<string>("__all__");

  type SortKey = "display_code" | "name" | "tag_type" | "is_active" | "revision";
  type SortDir = "asc" | "desc";
  const [sortKey, setSortKey] = useState<SortKey>("tag_type");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col)
      return <ArrowUpDown className="h-3 w-3 ml-1 opacity-40" />;
    return sortDir === "asc" ? (
      <ArrowUp className="h-3 w-3 ml-1" />
    ) : (
      <ArrowDown className="h-3 w-3 ml-1" />
    );
  };

  const filteredTags = tags
    .filter((t) => filterType === "__all__" || t.tag_type === filterType)
    .sort((a, b) => {
      const dir = sortDir === "asc" ? 1 : -1;
      const va = a[sortKey];
      const vb = b[sortKey];
      if (typeof va === "string" && typeof vb === "string")
        return va.localeCompare(vb, "ja") * dir;
      if (typeof va === "number" && typeof vb === "number")
        return (va - vb) * dir;
      if (typeof va === "boolean" && typeof vb === "boolean")
        return (Number(va) - Number(vb)) * dir;
      return 0;
    });

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
    setEditCode(null);
    setDialogOpen(true);
  };

  const handleEdit = (code: string) => {
    setEditCode(code);
    setDialogOpen(true);
  };

  const handleDelete = async (code: string) => {
    if (!confirm("このタグを無効化しますか？")) return;
    try {
      await api.delete(`/tags/${code}`);
      toast.success("タグを無効化しました");
      fetchTags();
    } catch (e) {
      const msg =
        e instanceof ApiError ? e.body.error : "無効化に失敗しました";
      toast.error(msg);
    }
  };

  const handleRestore = async (code: string) => {
    try {
      await api.post(`/tags/${code}/restore`, {});
      toast.success("タグを復元しました");
      fetchTags();
    } catch (e) {
      const msg =
        e instanceof ApiError ? e.body.error : "復元に失敗しました";
      toast.error(msg);
    }
  };

  const handleSuccess = () => {
    toast.success(editCode ? "タグを更新しました" : "タグを作成しました");
    setDialogOpen(false);
    fetchTags();
  };

  // Count by type for filter badges
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
      ) : filteredTags.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          タグがありません
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                {(
                  [
                    ["display_code", "コード"],
                    ["name", "名前"],
                    ["tag_type", "種別"],
                    ["is_active", "状態"],
                    ["revision", "Rev"],
                  ] as [SortKey, string][]
                ).map(([key, label]) => (
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
                <th className="pb-3 font-medium w-28">操作</th>
              </tr>
            </thead>
            <tbody>
              {filteredTags.map((t) => (
                <tr
                  key={t.code}
                  className={`border-b border-border/50 hover:bg-accent/30 transition-colors ${
                    !t.is_active ? "opacity-50" : ""
                  }`}
                >
                  <td className="py-3 pr-4 font-mono text-xs">
                    {t.display_code}
                  </td>
                  <td className="py-3 pr-4">{t.name}</td>
                  <td className="py-3 pr-4">
                    <Badge className={TYPE_COLOR[t.tag_type] || ""}>
                      {TYPE_LABEL[t.tag_type] || t.tag_type}
                    </Badge>
                  </td>
                  <td className="py-3 pr-4">
                    {t.is_active ? (
                      <Badge className="bg-green-900/30 text-green-400 border-green-800/50">
                        有効
                      </Badge>
                    ) : (
                      <Badge className="bg-red-900/30 text-red-400 border-red-800/50">
                        無効
                      </Badge>
                    )}
                  </td>
                  <td className="py-3 pr-4 text-muted-foreground">
                    {t.revision}
                  </td>
                  <td className="py-3">
                    <div className="flex gap-1">
                      {t.is_active ? (
                        <>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleEdit(t.code)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDelete(t.code)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </>
                      ) : (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleRestore(t.code)}
                        >
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
        editCode={editCode}
        tags={tags}
        onSuccess={handleSuccess}
      />
    </div>
  );
}

// ── Tag Dialog ──

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editCode: string | null;
  tags: TagRow[];
  onSuccess: () => void;
}

function TagDialog({
  open,
  onOpenChange,
  editCode,
  tags,
  onSuccess,
}: DialogProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [displayCode, setDisplayCode] = useState("");
  const [name, setName] = useState("");
  const [tagType, setTagType] = useState("label");

  useEffect(() => {
    if (!open) {
      setDisplayCode("");
      setName("");
      setTagType("label");
      setError(null);
      return;
    }
    if (!editCode) return;

    const existing = tags.find((t) => t.code === editCode);
    if (existing) {
      setDisplayCode(existing.display_code);
      setName(existing.name);
      setTagType(existing.tag_type);
    }
  }, [open, editCode, tags]);

  const handleSubmit = async () => {
    setError(null);

    if (!displayCode.trim() || !name.trim()) {
      setError("コードと名前は必須です");
      return;
    }

    setLoading(true);
    try {
      if (editCode) {
        await api.put(`/tags/${editCode}`, {
          display_code: displayCode.trim(),
          name: name.trim(),
          tag_type: tagType,
        });
      } else {
        await api.post("/tags", {
          display_code: displayCode.trim(),
          name: name.trim(),
          tag_type: tagType,
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
          <DialogTitle>
            {editCode ? "タグの編集" : "タグの新規作成"}
          </DialogTitle>
          <DialogDescription>
            {editCode
              ? "タグを更新します（新しいリビジョンが作成されます）"
              : "新しいタグを作成します"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>コード</Label>
            <Input
              value={displayCode}
              onChange={(e) => setDisplayCode(e.target.value)}
              placeholder="例: GROCERIES"
              className="font-mono"
            />
          </div>

          <div className="space-y-2">
            <Label>名前</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例: 食料品"
            />
          </div>

          <div className="space-y-2">
            <Label>種別</Label>
            <Select value={tagType} onValueChange={setTagType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TAG_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
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
