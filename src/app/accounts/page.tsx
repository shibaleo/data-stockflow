"use client";

import { useMemo } from "react";
import { MasterPage, type ExtraField } from "@/components/shared/master-page";
import { BookSelector } from "@/components/shared/book-selector";
import { useBooks } from "@/hooks/use-books";

const ACCOUNT_TYPES = [
  { value: "asset", label: "資産" },
  { value: "liability", label: "負債" },
  { value: "equity", label: "純資産" },
  { value: "revenue", label: "収益" },
  { value: "expense", label: "費用" },
];

const DEFAULT_TYPE_LABELS: Record<string, string> = {
  asset: "資産の部",
  liability: "負債の部",
  equity: "純資産の部",
  revenue: "収益の部",
  expense: "費用の部",
};

const dialogExtraFields: ExtraField[] = [
  {
    key: "account_type",
    label: "分類",
    type: "select",
    options: ACCOUNT_TYPES,
    format: (v) => ACCOUNT_TYPES.find((t) => t.value === v)?.label ?? String(v),
  },
];

export default function AccountsPage() {
  const { books, selectedBookId, setSelectedBookId, selectedBook } = useBooks();

  const sections = useMemo(() => {
    const labels = selectedBook?.type_labels ?? {};
    return ACCOUNT_TYPES.map((t) => [
      t.value,
      labels[t.value] || DEFAULT_TYPE_LABELS[t.value],
    ] as [string, string]);
  }, [selectedBook]);

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
    [selectedBookId, sections],
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
