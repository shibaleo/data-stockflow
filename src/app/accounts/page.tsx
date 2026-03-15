"use client";

import { useMemo } from "react";
import { MasterPage, type ExtraField } from "@/components/shared/master-page";
import { BookSelector } from "@/components/shared/book-selector";
import { useBooks } from "@/hooks/use-books";

const TYPE_KEYS = ["asset", "liability", "equity", "revenue", "expense"] as const;

const DEFAULT_TYPE_LABELS: Record<string, string> = {
  asset: "資産の部",
  liability: "負債の部",
  equity: "純資産の部",
  revenue: "収益の部",
  expense: "費用の部",
};

export default function AccountsPage() {
  const { books, selectedBookId, setSelectedBookId, selectedBook } = useBooks();

  const typeLabels = selectedBook?.type_labels ?? {};

  const typeOptions = useMemo(
    () => TYPE_KEYS.map((key) => ({
      value: key,
      label: typeLabels[key] || DEFAULT_TYPE_LABELS[key].replace("の部", ""),
    })),
    [typeLabels],
  );

  const sections = useMemo(
    () => TYPE_KEYS.map((key) => [
      key,
      typeLabels[key] || DEFAULT_TYPE_LABELS[key],
    ] as [string, string]),
    [typeLabels],
  );

  const dialogExtraFields = useMemo<ExtraField[]>(
    () => [{
      key: "account_type",
      label: "分類",
      type: "select",
      options: typeOptions,
      format: (v) => typeOptions.find((t) => t.value === v)?.label ?? String(v),
    }],
    [typeOptions],
  );

  const config = useMemo(
    () => ({
      title: "科目",
      endpoint: `/books/${selectedBookId}/accounts`,
      parentKey: "parent_account_id" as const,
      entityName: "勘定科目",
      codePlaceholder: "例: 1000",
      namePlaceholder: "例: 現金",
      groupBy: { field: "account_type", sections },
      dialogExtraFields,
    }),
    [selectedBookId, sections, dialogExtraFields],
  );

  if (!selectedBookId) {
    return <div className="p-6 text-center text-muted-foreground">帳簿を読み込み中...</div>;
  }

  return (
    <MasterPage
      key={selectedBookId}
      config={config}
      headerSlot={
        <BookSelector
          books={books}
          selectedBookId={selectedBookId}
          onValueChange={setSelectedBookId}
        />
      }
    />
  );
}
