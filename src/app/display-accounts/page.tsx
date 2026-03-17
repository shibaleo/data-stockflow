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

const AUTHORITY_LABELS: Record<string, string> = {
  tenant: "テナント",
  admin: "管理者",
  user: "ユーザー",
};

export default function DisplayAccountsPage() {
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

  const extraFields = useMemo<ExtraField[]>(
    () => [{
      key: "authority_level",
      label: "権限",
      type: "select" as const,
      options: Object.entries(AUTHORITY_LABELS).map(([value, label]) => ({ value, label })),
      format: (v) => AUTHORITY_LABELS[String(v)] ?? String(v),
      badgeClassName: (v) =>
        v === "tenant" ? "border-amber-600/50 text-amber-400" :
        v === "admin" ? "border-blue-600/50 text-blue-400" : "",
    }],
    [],
  );

  const dialogExtraFields = useMemo<ExtraField[]>(
    () => [
      {
        key: "account_type",
        label: "分類",
        type: "select" as const,
        options: typeOptions,
        format: (v) => typeOptions.find((t) => t.value === v)?.label ?? String(v),
      },
      {
        key: "sort_order",
        label: "表示順",
        type: "text" as const,
        placeholder: "0",
      },
    ],
    [typeOptions],
  );

  const config = useMemo(
    () => ({
      title: "表示科目",
      endpoint: `/books/${selectedBookId}/display-accounts`,
      parentKey: "parent_id" as const,
      entityName: "表示科目",
      codePlaceholder: "例: DA-5010",
      namePlaceholder: "例: 食費",
      groupBy: { field: "account_type", sections },
      extraFields,
      dialogExtraFields,
      extraFieldsFirst: true,
      parentFilter: (candidate: { [key: string]: unknown }, extras: Record<string, string>) => {
        const selectedType = extras.account_type;
        if (!selectedType) return true;
        return candidate.account_type === selectedType;
      },
    }),
    [selectedBookId, sections, extraFields, dialogExtraFields],
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
