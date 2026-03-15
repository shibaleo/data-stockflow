"use client";

import { useState, useEffect, useCallback } from "react";
import { Plus, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { JournalTable, type VoucherRow } from "@/components/journals/journal-table";
import { JournalForm } from "@/components/journals/journal-form";
import { api, ApiError } from "@/lib/api-client";

type ViewMode = "list" | "form";

export default function VouchersPage() {
  const [vouchers, setVouchers] = useState<VoucherRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<ViewMode>("list");
  const [editId, setEditId] = useState<number | null>(null);

  const fetchVouchers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<{ data: VoucherRow[] }>("/vouchers");
      setVouchers(res.data);
    } catch (e) {
      const msg =
        e instanceof ApiError ? e.body.error : "伝票の取得に失敗しました";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchVouchers();
  }, [fetchVouchers]);

  const handleCreate = () => {
    setEditId(null);
    setView("form");
  };

  const handleEdit = (id: number) => {
    setEditId(id);
    setView("form");
  };

  const handleDelete = async (id: number) => {
    if (!confirm("この伝票の仕訳を削除（無効化）しますか？")) return;
    try {
      const detail = await api.get<{ data: { journals: { id: number }[] } }>(`/vouchers/${id}`);
      for (const j of detail.data.journals) {
        await api.delete(`/vouchers/${id}/journals/${j.id}`);
      }
      toast.success("仕訳を削除しました");
      fetchVouchers();
    } catch (e) {
      const msg =
        e instanceof ApiError ? e.body.error : "削除に失敗しました";
      toast.error(msg);
    }
  };

  const handleFormSuccess = () => {
    toast.success(editId ? "伝票を更新しました" : "伝票を作成しました");
    setView("list");
    fetchVouchers();
  };

  if (view === "form") {
    return (
      <div className="h-full flex flex-col">
        <JournalForm
          editId={editId}
          onSuccess={handleFormSuccess}
          onCancel={() => setView("list")}
        />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold">取引</h2>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={fetchVouchers}>
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button size="sm" onClick={handleCreate}>
            <Plus className="h-4 w-4 mr-1" />
            新規伝票
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12 text-muted-foreground">
          読み込み中...
        </div>
      ) : (
        <JournalTable
          vouchers={vouchers}
          onEdit={handleEdit}
          onDelete={handleDelete}
        />
      )}
    </div>
  );
}
