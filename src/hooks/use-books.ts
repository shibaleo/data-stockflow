"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api-client";

export interface BookRow {
  id: number;
  code: string;
  name: string;
  unit: string;
  unit_symbol: string;
  unit_position: string;
  type_labels: Record<string, string>;
  is_active: boolean;
  revision: number;
  created_at: string;
}

/**
 * Shared hook for fetching active books and managing selection.
 *
 * - Fetches active books on mount
 * - Auto-selects the first book
 * - Provides the selected BookRow for convenience
 */
export function useBooks() {
  const [books, setBooks] = useState<BookRow[]>([]);
  const [selectedBookId, setSelectedBookId] = useState<string>("");

  const selectedBook = useMemo(
    () => books.find((b) => String(b.id) === selectedBookId) ?? null,
    [books, selectedBookId],
  );

  const refetchBooks = useCallback(async () => {
    try {
      const res = await api.get<{ data: BookRow[] }>("/books");
      const active = res.data.filter((b) => b.is_active);
      setBooks(active);
      if (active.length > 0 && !selectedBookId) {
        setSelectedBookId(String(active[0].id));
      }
      return active;
    } catch (e) {
      const msg = e instanceof ApiError ? e.body.error : "帳簿の取得に失敗しました";
      toast.error(msg);
      return [];
    }
  }, [selectedBookId]);

  useEffect(() => {
    refetchBooks();
  }, []);

  return {
    books,
    selectedBookId,
    setSelectedBookId,
    selectedBook,
    refetchBooks,
  };
}
