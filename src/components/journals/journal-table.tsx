"use client";

import { Pencil, Trash2 } from "lucide-react";
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

export function JournalTable({ journals, onEdit, onDelete }: Props) {
  if (journals.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        仕訳がありません
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-muted-foreground">
            <th className="pb-3 pr-4 font-medium">伝票番号</th>
            <th className="pb-3 pr-4 font-medium">計上日</th>
            <th className="pb-3 pr-4 font-medium">摘要</th>
            <th className="pb-3 pr-4 font-medium">種別</th>
            <th className="pb-3 pr-4 font-medium">Rev</th>
            <th className="pb-3 font-medium w-24">操作</th>
          </tr>
        </thead>
        <tbody>
          {journals.map((j) => (
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
