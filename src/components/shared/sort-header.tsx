"use client";

import { ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";

interface Props<K extends string> {
  column: K;
  label: string;
  sortKey: K;
  sortDir: "asc" | "desc";
  onToggle: (key: K) => void;
}

/**
 * Sortable table header button with directional icon.
 */
export function SortHeader<K extends string>({
  column,
  label,
  sortKey,
  sortDir,
  onToggle,
}: Props<K>) {
  const Icon =
    sortKey !== column
      ? ArrowUpDown
      : sortDir === "asc"
        ? ArrowUp
        : ArrowDown;

  return (
    <button
      className="inline-flex items-center hover:text-foreground transition-colors"
      onClick={() => onToggle(column)}
    >
      {label}
      <Icon
        className={`h-3 w-3 ml-1 ${sortKey !== column ? "opacity-40" : ""}`}
      />
    </button>
  );
}
