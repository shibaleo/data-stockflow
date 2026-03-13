"use client";

import { useState } from "react";
import {
  Pencil,
  Trash2,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export interface JournalRow {
  id: string;
  idempotency_code: string;
  voucher_code: string | null;
  fiscal_period_code: string;
  revision: number;
  is_active: boolean;
  posted_date: string;
  journal_type: string;
  slip_category: string;
  adjustment_flag: string;
  description: string | null;
  source_system: string | null;
  created_by: string;
  created_at: string;
}

interface Props {
  journals: JournalRow[];
  onEdit: (code: string) => void;
  onDelete: (code: string) => void;
}

const TYPE_LABELS: Record<string, string> = {
  normal: "通常",
  closing: "決算",
  prior_adj: "前期調整",
  auto: "自動",
};

type SortKey =
  | "voucher_code"
  | "posted_date"
  | "description"
  | "journal_type"
  | "revision";
type SortDir = "asc" | "desc";

export function JournalTable({ journals, onEdit, onDelete }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>("posted_date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col)
      return <ArrowUpDown className="h-3 w-3 ml-1 opacity-40" />;
    return sortDir === "asc" ? (
      <ArrowUp className="h-3 w-3 ml-1" />
    ) : (
      <ArrowDown className="h-3 w-3 ml-1" />
    );
  };

  const sorted = [...journals].sort((a, b) => {
    const dir = sortDir === "asc" ? 1 : -1;
    const va = a[sortKey];
    const vb = b[sortKey];
    if (va == null && vb == null) return 0;
    if (va == null) return 1;
    if (vb == null) return -1;
    if (typeof va === "string" && typeof vb === "string")
      return va.localeCompare(vb, "ja") * dir;
    if (typeof va === "number" && typeof vb === "number")
      return (va - vb) * dir;
    return 0;
  });

  if (journals.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        仕訳がありません
      </div>
    );
  }

  const columns: [SortKey, string][] = [
    ["voucher_code", "伝票番号"],
    ["posted_date", "計上日"],
    ["description", "摘要"],
    ["journal_type", "種別"],
    ["revision", "Rev"],
  ];

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-muted-foreground">
            {columns.map(([key, label]) => (
              <th key={key} className="pb-3 pr-4 font-medium">
                <button
                  className="inline-flex items-center hover:text-foreground transition-colors"
                  onClick={() => toggleSort(key)}
                >
                  {label}
                  <SortIcon col={key} />
                </button>
              </th>
            ))}
            <th className="pb-3 font-medium w-24">操作</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((j) => (
            <tr
              key={j.id}
              className="border-b border-border/50 hover:bg-accent/30 transition-colors"
            >
              <td className="py-3 pr-4 font-mono text-xs">
                {j.voucher_code || "-"}
              </td>
              <td className="py-3 pr-4">
                {new Date(j.posted_date).toLocaleDateString("ja-JP")}
              </td>
              <td className="py-3 pr-4 max-w-[300px] truncate">
                {j.description || "-"}
              </td>
              <td className="py-3 pr-4">
                <Badge variant="secondary">
                  {TYPE_LABELS[j.journal_type] || j.journal_type}
                </Badge>
              </td>
              <td className="py-3 pr-4 text-muted-foreground">{j.revision}</td>
              <td className="py-3">
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => onEdit(j.idempotency_code)}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => onDelete(j.idempotency_code)}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
