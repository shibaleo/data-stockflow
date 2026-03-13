"use client";

import { useState, useEffect, useCallback } from "react";
import { Plus, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { JournalTable, type JournalRow } from "@/components/journals/journal-table";
import { JournalForm } from "@/components/journals/journal-form";
import { api, ApiError } from "@/lib/api-client";

type ViewMode = "list" | "form";

export default function JournalsPage() {
  const [journals, setJournals] = useState<JournalRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<ViewMode>("list");
  const [editCode, setEditCode] = useState<string | null>(null);

  const fetchJournals = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<{ data: JournalRow[] }>("/journals?limit=100");
      setJournals(res.data);
    } catch (e) {
      const msg =
        e instanceof ApiError ? e.body.error : "仕訳の取得に失敗しました";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchJournals();
  }, [fetchJournals]);

  const handleCreate = () => {
    setEditCode(null);
    setView("form");
  };

  const handleEdit = (code: string) => {
    setEditCode(code);
    setView("form");
  };

  const handleDelete = async (code: string) => {
    if (!confirm("この仕訳を削除（無効化）しますか？")) return;
    try {
      await api.delete(`/journals/${code}`);
      toast.success("仕訳を削除しました");
      fetchJournals();
    } catch (e) {
      const msg =
        e instanceof ApiError ? e.body.error : "削除に失敗しました";
      toast.error(msg);
    }
  };

  const handleFormSuccess = () => {
    toast.success(editCode ? "仕訳を更新しました" : "仕訳を作成しました");
    setView("list");
    fetchJournals();
  };

  const handleFormCancel = () => {
    setView("list");
  };

  // Form view: full-height inline form
  if (view === "form") {
    return (
      <div className="h-full flex flex-col">
        <JournalForm
          editCode={editCode}
          onSuccess={handleFormSuccess}
          onCancel={handleFormCancel}
        />
      </div>
    );
  }

  // List view
  return (
    <div className="p-4 md:p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold">仕訳一覧</h2>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={fetchJournals}>
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button size="sm" onClick={handleCreate}>
            <Plus className="h-4 w-4 mr-1" />
            新規仕訳
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12 text-muted-foreground">
          読み込み中...
        </div>
      ) : (
        <JournalTable
          journals={journals}
          onEdit={handleEdit}
          onDelete={handleDelete}
        />
      )}
    </div>
  );
}
