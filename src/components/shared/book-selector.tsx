"use client";

import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { BookRow } from "@/hooks/use-books";

interface Props {
  books: BookRow[];
  selectedBookId: string;
  onValueChange: (id: string) => void;
  /** If true, show "すべての帳簿" option */
  allowAll?: boolean;
}

/**
 * Book selector — renders a Select when multiple books exist,
 * a static Badge when only one, nothing when empty.
 */
export function BookSelector({ books, selectedBookId, onValueChange, allowAll }: Props) {
  if (books.length === 0) return null;

  if (books.length === 1 && !allowAll) {
    return (
      <Badge variant="outline" className="text-xs">
        {books[0].name} ({books[0].unit})
      </Badge>
    );
  }

  return (
    <Select value={selectedBookId} onValueChange={onValueChange}>
      <SelectTrigger className="w-48 h-8">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {allowAll && <SelectItem value="__all__">すべての帳簿</SelectItem>}
        {books.map((b) => (
          <SelectItem key={b.id} value={String(b.id)}>
            {b.name}
            <span className="text-muted-foreground ml-1 text-xs">({b.unit})</span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
