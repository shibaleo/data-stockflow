"use client";

import { Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SortHeader } from "@/components/shared/sort-header";
import { useSort } from "@/hooks/use-sort";

export interface VoucherRow {
  id: number;
  fiscal_period_id: number;
  idempotency_key: string;
  voucher_code: string | null;
  posted_date: string;
  description: string | null;
  source_system: string | null;
  created_at: string;
}

interface Props {
  vouchers: VoucherRow[];
  onEdit: (id: number) => void;
  onDelete: (id: number) => void;
}

type VoucherSortKey = "voucher_code" | "posted_date" | "description" | "id";

const COLUMNS: [VoucherSortKey, string][] = [
  ["voucher_code", "伝票番号"],
  ["posted_date", "計上日"],
  ["description", "摘要"],
  ["id", "ID"],
];

export function JournalTable({ vouchers, onEdit, onDelete }: Props) {
  const { sorted, sortKey, sortDir, toggleSort } = useSort<VoucherRow, VoucherSortKey>(
    vouchers, "posted_date", "desc"
  );

  if (vouchers.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        伝票がありません
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-muted-foreground">
            {COLUMNS.map(([key, label]) => (
              <th key={key} className="pb-3 pr-4 font-medium">
                <SortHeader
                  column={key}
                  label={label}
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onToggle={toggleSort}
                />
              </th>
            ))}
            <th className="pb-3 font-medium w-24">操作</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((v) => (
            <tr
              key={v.id}
              className="border-b border-border/50 hover:bg-accent/30 transition-colors"
            >
              <td className="py-3 pr-4 font-mono text-xs">
                {v.voucher_code || "-"}
              </td>
              <td className="py-3 pr-4">
                {new Date(v.posted_date).toLocaleDateString("ja-JP")}
              </td>
              <td className="py-3 pr-4 max-w-[300px] truncate">
                {v.description || "-"}
              </td>
              <td className="py-3 pr-4 text-muted-foreground font-mono text-xs">
                {v.id}
              </td>
              <td className="py-3">
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => onEdit(v.id)}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => onDelete(v.id)}
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
