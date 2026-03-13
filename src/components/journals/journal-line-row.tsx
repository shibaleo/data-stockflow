"use client";

import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export interface LineData {
  side: "debit" | "credit";
  account_code: string;
  amount: string;
  description: string;
}

interface Account {
  code: string;
  name: string;
}

interface Props {
  line: LineData;
  index: number;
  accounts: Account[];
  onChange: (index: number, field: keyof LineData, value: string) => void;
  onRemove: (index: number) => void;
  canRemove: boolean;
}

export function JournalLineRow({
  line,
  index,
  accounts,
  onChange,
  onRemove,
  canRemove,
}: Props) {
  return (
    <div className="flex items-center gap-2">
      <Select
        value={line.side}
        onValueChange={(v) => onChange(index, "side", v)}
      >
        <SelectTrigger className="w-24 shrink-0">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="debit">借方</SelectItem>
          <SelectItem value="credit">貸方</SelectItem>
        </SelectContent>
      </Select>

      <Select
        value={line.account_code}
        onValueChange={(v) => onChange(index, "account_code", v)}
      >
        <SelectTrigger className="w-48 shrink-0">
          <SelectValue placeholder="勘定科目" />
        </SelectTrigger>
        <SelectContent>
          {accounts.map((a) => (
            <SelectItem key={a.code} value={a.code}>
              {a.code} - {a.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Input
        type="number"
        min="0"
        step="1"
        placeholder="金額"
        className="w-32 shrink-0 text-right"
        value={line.amount}
        onChange={(e) => onChange(index, "amount", e.target.value)}
      />

      <Input
        placeholder="摘要"
        className="flex-1 min-w-0"
        value={line.description}
        onChange={(e) => onChange(index, "description", e.target.value)}
      />

      <Button
        variant="ghost"
        size="icon"
        onClick={() => onRemove(index)}
        disabled={!canRemove}
        className="shrink-0"
      >
        <Trash2 className="h-4 w-4 text-destructive" />
      </Button>
    </div>
  );
}
