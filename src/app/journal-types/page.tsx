"use client";

import { useMemo } from "react";
import { MasterPage } from "@/components/shared/master-page";
import { BookSelector } from "@/components/shared/book-selector";
import { useBooks } from "@/hooks/use-books";

export default function JournalTypesPage() {
  const { books, selectedBookId, setSelectedBookId } = useBooks();

  const config = useMemo(
    () => ({
      title: "仕訳種別",
      endpoint: `/books/${selectedBookId}/journal-types`,
      parentKey: "parent_journal_type_id" as const,
      entityName: "仕訳種別",
      codePlaceholder: "例: normal",
      namePlaceholder: "例: 通常仕訳",
    }),
    [selectedBookId],
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
