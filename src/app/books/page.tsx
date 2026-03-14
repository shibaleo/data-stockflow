"use client";

import { useState, useEffect, useCallback } from "react";
import { Plus, Pencil, RefreshCw, Trash2, RotateCcw } from "lucide-react";
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
import { api, ApiError } from "@/lib/api-client";

interface BookRow {
  id: string;
  code: string;
  display_code: string;
  name: string;
  unit: string;
  type_labels: Record<string, string>;
  is_active: boolean;
  created_at: string;
}

const DEFAULT_TYPE_LABELS: Record<string, string> = {
  asset: "資産の部",
  liability: "負債の部",
  equity: "純資産の部",
  revenue: "収益の部",
  expense: "費用の部",
};

const TYPE_KEYS = ["asset", "liability", "equity", "revenue", "expense"] as const;

export default function BooksPage() {
  const [books, setBooks] = useState<BookRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editCode, setEditCode] = useState<string | null>(null);

  // Form state
  const [name, setName] = useState("");
  const [unit, setUnit] = useState("");
  const [typeLabels, setTypeLabels] = useState<Record<string, string>>({});

  const fetchBooks = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<{ data: BookRow[] }>("/books");
      setBooks(res.data);
    } catch (e) {
      const msg = e instanceof ApiError ? e.body.error : "帳簿の取得に失敗しました";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBooks();
  }, [fetchBooks]);

  const handleCreate = () => {
    setEditCode(null);
    setName("");
    setUnit("");
    setTypeLabels({});
    setDialogOpen(true);
  };

  const handleEdit = (book: BookRow) => {
    setEditCode(book.code);
    setName(book.name);
    setUnit(book.unit);
    setTypeLabels(book.type_labels ?? {});
    setDialogOpen(true);
  };

  const handleDeactivate = async (bookCode: string) => {
    if (!confirm("この帳簿を無効化しますか？")) return;
    try {
      await api.delete(`/books/${bookCode}`);
      toast.success("帳簿を無効化しました");
      fetchBooks();
    } catch (e) {
      const msg = e instanceof ApiError ? e.body.error : "無効化に失敗しました";
      toast.error(msg);
    }
  };

  const handleRestore = async (bookCode: string) => {
    try {
      await api.post(`/books/${bookCode}/restore`, {});
      toast.success("帳簿を復元しました");
      fetchBooks();
    } catch (e) {
      const msg = e instanceof ApiError ? e.body.error : "復元に失敗しました";
      toast.error(msg);
    }
  };

  const handleSubmit = async () => {
    try {
      // Filter out empty labels
      const labels: Record<string, string> = {};
      for (const [k, v] of Object.entries(typeLabels)) {
        if (v.trim()) labels[k] = v.trim();
      }

      if (editCode) {
        await api.put(`/books/${editCode}`, {
          name,
          unit,
          type_labels: labels,
        });
        toast.success("帳簿を更新しました");
      } else {
        await api.post("/books", {
          name,
          unit,
          type_labels: labels,
        });
        toast.success("帳簿を作成しました");
      }
      setDialogOpen(false);
      fetchBooks();
    } catch (e) {
      const msg = e instanceof ApiError ? e.body.error : "保存に失敗しました";
      toast.error(msg);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between p-4 md:p-6 border-b border-border/30">
        <h2 className="text-xl font-semibold">帳簿管理</h2>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={fetchBooks}>
            <RefreshCw className="size-4 mr-1" />
            更新
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 md:p-6">
        {loading ? (
          <div className="text-center py-12 text-muted-foreground">読み込み中...</div>
        ) : books.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            帳簿がありません
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="py-2 px-3 font-medium">コード</th>
                  <th className="py-2 px-3 font-medium">名前</th>
                  <th className="py-2 px-3 font-medium">単位</th>
                  <th className="py-2 px-3 font-medium">状態</th>
                  <th className="py-2 px-3 font-medium">科目区分ラベル</th>
                  <th className="py-2 px-3 font-medium w-24" />
                </tr>
              </thead>
              <tbody>
                {books.map((book) => {
                  const customLabels = Object.entries(book.type_labels ?? {});
                  const inactive = !book.is_active;
                  return (
                    <tr
                      key={book.code}
                      className={`border-b border-border/50 transition-colors ${inactive ? "opacity-50" : "hover:bg-accent/20"}`}
                    >
                      <td className="py-2 px-3 font-mono text-xs">
                        {book.display_code}
                      </td>
                      <td className="py-2 px-3">{book.name}</td>
                      <td className="py-2 px-3">
                        <Badge variant="secondary">{book.unit}</Badge>
                      </td>
                      <td className="py-2 px-3">
                        {inactive ? (
                          <Badge variant="destructive" className="text-xs">無効</Badge>
                        ) : (
                          <Badge variant="default" className="text-xs">有効</Badge>
                        )}
                      </td>
                      <td className="py-2 px-3">
                        {customLabels.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {customLabels.map(([k, v]) => (
                              <Badge key={k} variant="outline" className="text-xs">
                                {k}: {v}
                              </Badge>
                            ))}
                          </div>
                        ) : (
                          <span className="text-muted-foreground text-xs">デフォルト</span>
                        )}
                      </td>
                      <td className="py-2 px-3">
                        <div className="flex gap-1">
                          {inactive ? (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-7"
                              title="復元"
                              onClick={() => handleRestore(book.code)}
                            >
                              <RotateCcw className="size-3.5" />
                            </Button>
                          ) : (
                            <>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="size-7"
                                title="編集"
                                onClick={() => handleEdit(book)}
                              >
                                <Pencil className="size-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="size-7 text-destructive"
                                title="無効化"
                                onClick={() => handleDeactivate(book.code)}
                              >
                                <Trash2 className="size-3.5" />
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
      </div>

      {/* FAB */}
      <Button
        className="fixed bottom-6 right-6 rounded-full size-12 shadow-lg"
        onClick={handleCreate}
      >
        <Plus className="size-5" />
      </Button>

      {/* Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editCode ? "帳簿を編集" : "帳簿を作成"}</DialogTitle>
            <DialogDescription>
              {editCode
                ? "帳簿の名前、単位、科目区分ラベルを編集できます。"
                : "新しい帳簿を作成します。"}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>名前</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="例: JPY会計帳簿"
              />
            </div>

            <div className="space-y-2">
              <Label>単位</Label>
              <Input
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                placeholder="例: JPY, USD, candy_pcs"
              />
            </div>

            {/* Type labels section */}
            <div className="space-y-2">
              <Label>科目区分ラベル</Label>
              <p className="text-xs text-muted-foreground">
                空欄の場合はデフォルト名が使用されます。
              </p>
              <div className="space-y-2">
                {TYPE_KEYS.map((key) => (
                  <div key={key} className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground w-20 shrink-0">
                      {key}
                    </span>
                    <Input
                      className="h-8 text-sm"
                      value={typeLabels[key] ?? ""}
                      onChange={(e) =>
                        setTypeLabels((prev) => ({
                          ...prev,
                          [key]: e.target.value,
                        }))
                      }
                      placeholder={DEFAULT_TYPE_LABELS[key]}
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              キャンセル
            </Button>
            <Button onClick={handleSubmit} disabled={!name || !unit}>
              {editCode ? "更新" : "作成"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
