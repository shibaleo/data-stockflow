"use client";

import { useMemo, useState, useEffect } from "react";
import { MasterPage, type ExtraField } from "@/components/shared/master-page";
import { BookSelector } from "@/components/shared/book-selector";
import { useBooks } from "@/hooks/use-books";
import { fetchAllPages } from "@/lib/api-client";

interface DisplayAccountRow {
  id: number;
  code: string;
  name: string;
  account_type: string;
  parent_id: number | null;
}

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
  const [displayAccounts, setDisplayAccounts] = useState<DisplayAccountRow[]>([]);

  useEffect(() => {
    if (!selectedBookId) return;
    fetchAllPages<DisplayAccountRow>(`/books/${selectedBookId}/display-accounts`)
      .then(setDisplayAccounts)
      .catch(() => setDisplayAccounts([]));
  }, [selectedBookId]);

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

  // Only leaf display accounts (no children) can be mapped to accounts
  const leafDisplayAccounts = useMemo(() => {
    const parentIds = new Set(
      displayAccounts.map((da) => String(da.parent_id)).filter((v) => v !== "null"),
    );
    return displayAccounts.filter((da) => !parentIds.has(String(da.id)));
  }, [displayAccounts]);

  const displayAccountOptions = useMemo(
    () => leafDisplayAccounts.map((da) => ({
      value: String(da.id),
      label: `${da.code} ${da.name}`,
    })),
    [leafDisplayAccounts],
  );

  const displayAccountMap = useMemo(
    () => new Map(displayAccounts.map((da) => [String(da.id), da])),
    [displayAccounts],
  );

  const extraFields = useMemo<ExtraField[]>(
    () => [{
      key: "display_account_id",
      label: "表示科目",
      type: "select" as const,
      options: displayAccountOptions,
      nullable: true,
      format: (v) => {
        if (v == null) return "";
        const da = displayAccountMap.get(String(v));
        return da ? da.name : "";
      },
      badge: true,
      badgeClassName: () => "border-emerald-600/50 text-emerald-400",
    }],
    [displayAccountOptions, displayAccountMap],
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
        key: "display_account_id",
        label: "表示科目",
        type: "select" as const,
        options: displayAccountOptions,
        nullable: true,
        format: (v) => {
          if (v == null) return "なし";
          const da = displayAccountMap.get(String(v));
          return da ? `${da.code} ${da.name}` : "なし";
        },
      },
    ],
    [typeOptions, displayAccountOptions, displayAccountMap],
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
      extraFields,
      dialogExtraFields,
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
