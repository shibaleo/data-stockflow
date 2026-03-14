"use client";

import { useState, useMemo } from "react";

type SortDir = "asc" | "desc";

/**
 * Generic, type-safe sorting hook.
 *
 * Usage:
 *   const { sorted, sortKey, sortDir, toggleSort } = useSort(items, "start_date");
 */
export function useSort<T, K extends string = string>(
  items: T[],
  defaultKey: K,
  defaultDir: SortDir = "asc",
) {
  const [sortKey, setSortKey] = useState<K>(defaultKey);
  const [sortDir, setSortDir] = useState<SortDir>(defaultDir);

  const toggleSort = (key: K) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const sorted = useMemo(() => {
    const dir = sortDir === "asc" ? 1 : -1;
    return [...items].sort((a, b) => {
      const va = (a as Record<string, unknown>)[sortKey];
      const vb = (b as Record<string, unknown>)[sortKey];
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      if (typeof va === "string" && typeof vb === "string")
        return va.localeCompare(vb, "ja") * dir;
      if (typeof va === "number" && typeof vb === "number")
        return (va - vb) * dir;
      if (typeof va === "boolean" && typeof vb === "boolean")
        return (Number(va) - Number(vb)) * dir;
      return 0;
    });
  }, [items, sortKey, sortDir]);

  return { sorted, sortKey, sortDir, toggleSort };
}
