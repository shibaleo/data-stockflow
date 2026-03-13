"use client";

import { useState, useEffect, useCallback } from "react";
import { Plus, Pencil, Trash2, RefreshCw, Undo2, ArrowUpDown, ArrowUp, ArrowDown, ChevronRight, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { api, ApiError } from "@/lib/api-client";

interface AccountRow {
  code: string;
  display_code: string;
  name: string;
  unit: string;
  account_type: string;
  sign: number;
  is_active: boolean;
  parent_account_code: string | null;
  revision: number;
}

const ACCOUNT_TYPES = [
  { value: "asset", label: "資産" },
  { value: "liability", label: "負債" },
  { value: "equity", label: "純資産" },
  { value: "revenue", label: "収益" },
  { value: "expense", label: "費用" },
] as const;

const TYPE_LABEL: Record<string, string> = {
  asset: "資産",
  liability: "負債",
  equity: "純資産",
  revenue: "収益",
  expense: "費用",
};

const SIGN_LABEL: Record<number, string> = {
  1: "貸方正 (+1)",
  [-1]: "借方正 (-1)",
};

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editCode, setEditCode] = useState<string | null>(null);

  type SortKey = "display_code" | "name" | "account_type" | "sign" | "is_active" | "revision";
  type SortDir = "asc" | "desc";
  const [sortKey, setSortKey] = useState<SortKey>("display_code");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const toggleCollapse = (code: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  };

  // Build tree-ordered flat list with depth info
  type AccountWithDepth = AccountRow & { depth: number; hasChildren: boolean };

  const treeAccounts: AccountWithDepth[] = (() => {
    const compareFn = (a: AccountRow, b: AccountRow) => {
      const dir = sortDir === "asc" ? 1 : -1;
      const va = a[sortKey];
      const vb = b[sortKey];
      if (typeof va === "string" && typeof vb === "string") return va.localeCompare(vb, "ja") * dir;
      if (typeof va === "number" && typeof vb === "number") return (va - vb) * dir;
      if (typeof va === "boolean" && typeof vb === "boolean") return (Number(va) - Number(vb)) * dir;
      return 0;
    };

    // Group by parent
    const childrenOf = new Map<string | null, AccountRow[]>();
    for (const a of accounts) {
      const key = a.parent_account_code;
      if (!childrenOf.has(key)) childrenOf.set(key, []);
      childrenOf.get(key)!.push(a);
    }

    const result: AccountWithDepth[] = [];
    const walk = (parentCode: string | null, depth: number) => {
      const siblings = childrenOf.get(parentCode);
      if (!siblings) return;
      siblings.sort(compareFn);
      for (const a of siblings) {
        const hasChildren = childrenOf.has(a.code) && childrenOf.get(a.code)!.length > 0;
        result.push({ ...a, depth, hasChildren });
        if (hasChildren && !collapsed.has(a.code)) {
          walk(a.code, depth + 1);
        }
      }
    };
    walk(null, 0);

    // Orphans: accounts whose parent_account_code doesn't match any existing code
    const allCodes = new Set(accounts.map((a) => a.code));
    const orphans = accounts.filter(
      (a) => a.parent_account_code && !allCodes.has(a.parent_account_code) && !result.some((r) => r.code === a.code)
    );
    if (orphans.length > 0) {
      orphans.sort(compareFn);
      for (const a of orphans) {
        result.push({ ...a, depth: 0, hasChildren: false });
      }
    }

    return result;
  })();

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return <ArrowUpDown className="h-3 w-3 ml-1 opacity-40" />;
    return sortDir === "asc"
      ? <ArrowUp className="h-3 w-3 ml-1" />
      : <ArrowDown className="h-3 w-3 ml-1" />;
  };

  const fetchAccounts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<{ data: AccountRow[] }>(
        "/accounts?limit=200"
      );
      setAccounts(res.data);
    } catch (e) {
      const msg =
        e instanceof ApiError ? e.body.error : "勘定科目の取得に失敗しました";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAccounts();
  }, [fetchAccounts]);

  const handleCreate = () => {
    setEditCode(null);
    setDialogOpen(true);
  };

  const handleEdit = (code: string) => {
    setEditCode(code);
    setDialogOpen(true);
  };

  const handleDelete = async (code: string) => {
    if (!confirm("この勘定科目を無効化しますか？")) return;
    try {
      await api.delete(`/accounts/${code}`);
      toast.success("勘定科目を無効化しました");
      fetchAccounts();
    } catch (e) {
      const msg =
        e instanceof ApiError ? e.body.error : "無効化に失敗しました";
      toast.error(msg);
    }
  };

  const handleRestore = async (code: string) => {
    try {
      await api.post(`/accounts/${code}/restore`, {});
      toast.success("勘定科目を復元しました");
      fetchAccounts();
    } catch (e) {
      const msg =
        e instanceof ApiError ? e.body.error : "復元に失敗しました";
      toast.error(msg);
    }
  };

  const handleSuccess = () => {
    toast.success(
      editCode ? "勘定科目を更新しました" : "勘定科目を作成しました"
    );
    setDialogOpen(false);
    fetchAccounts();
  };

  return (
    <div className="p-4 md:p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold">勘定科目</h2>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={fetchAccounts}>
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button size="sm" onClick={handleCreate}>
            <Plus className="h-4 w-4 mr-1" />
            新規作成
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12 text-muted-foreground">
          読み込み中...
        </div>
      ) : accounts.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          勘定科目がありません
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                {([
                  ["display_code", "コード"],
                  ["name", "科目名"],
                  ["account_type", "分類"],
                  ["sign", "符号"],
                  ["is_active", "状態"],
                  ["revision", "Rev"],
                ] as [SortKey, string][]).map(([key, label]) => (
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
                <th className="pb-3 font-medium w-28">操作</th>
              </tr>
            </thead>
            <tbody>
              {treeAccounts.map((a) => (
                <tr
                  key={a.code}
                  className={`border-b border-border/50 hover:bg-accent/30 transition-colors ${
                    !a.is_active ? "opacity-50" : ""
                  }`}
                >
                  <td className="py-3 pr-4 font-mono text-xs">{a.display_code}</td>
                  <td className="py-3 pr-4">
                    <div className="flex items-center" style={{ paddingLeft: `${a.depth * 20}px` }}>
                      {a.hasChildren ? (
                        <button
                          className="mr-1 text-muted-foreground hover:text-foreground transition-colors"
                          onClick={() => toggleCollapse(a.code)}
                        >
                          {collapsed.has(a.code)
                            ? <ChevronRight className="h-4 w-4" />
                            : <ChevronDown className="h-4 w-4" />}
                        </button>
                      ) : a.depth > 0 ? (
                        <span className="mr-1 w-4 text-center text-muted-foreground/50">└</span>
                      ) : (
                        <span className="mr-1 w-4" />
                      )}
                      {a.name}
                    </div>
                  </td>
                  <td className="py-3 pr-4">
                    <Badge variant="secondary">
                      {TYPE_LABEL[a.account_type] || a.account_type}
                    </Badge>
                  </td>
                  <td className="py-3 pr-4 text-xs text-muted-foreground">
                    {a.sign === 1 ? "貸方(+)" : "借方(-)"}
                  </td>
                  <td className="py-3 pr-4">
                    {a.is_active ? (
                      <Badge className="bg-green-900/30 text-green-400 border-green-800/50">
                        有効
                      </Badge>
                    ) : (
                      <Badge className="bg-red-900/30 text-red-400 border-red-800/50">
                        無効
                      </Badge>
                    )}
                  </td>
                  <td className="py-3 pr-4 text-muted-foreground">
                    {a.revision}
                  </td>
                  <td className="py-3">
                    <div className="flex gap-1">
                      {a.is_active ? (
                        <>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleEdit(a.code)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDelete(a.code)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </>
                      ) : (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleRestore(a.code)}
                        >
                          <Undo2 className="h-4 w-4 text-green-400" />
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Button
        className="fixed bottom-6 right-6 h-14 w-14 rounded-full shadow-lg"
        size="icon"
        onClick={handleCreate}
      >
        <Plus className="h-6 w-6" />
      </Button>

      <AccountDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editCode={editCode}
        accounts={accounts}
        onSuccess={handleSuccess}
      />
    </div>
  );
}

// ── Account Dialog ──

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editCode: string | null;
  accounts: AccountRow[];
  onSuccess: () => void;
}

function AccountDialog({
  open,
  onOpenChange,
  editCode,
  accounts,
  onSuccess,
}: DialogProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [displayCode, setDisplayCode] = useState("");
  const [name, setName] = useState("");
  const [accountType, setAccountType] = useState("asset");
  const [sign, setSign] = useState(-1);
  const [unit, setUnit] = useState("JPY");
  const [parentAccountCode, setParentAccountCode] = useState("");

  // Load existing account for edit
  useEffect(() => {
    if (!open) {
      setDisplayCode("");
      setName("");
      setAccountType("asset");
      setSign(-1);
      setUnit("JPY");
      setParentAccountCode("__none__");
      setError(null);
      return;
    }
    if (!editCode) return;

    const existing = accounts.find((a) => a.code === editCode);
    if (existing) {
      setDisplayCode(existing.display_code);
      setName(existing.name);
      setAccountType(existing.account_type);
      setSign(existing.sign);
      setUnit(existing.unit);
      setParentAccountCode(existing.parent_account_code || "__none__");
    }
  }, [open, editCode, accounts]);

  // Auto-set sign based on account type
  const handleTypeChange = (type: string) => {
    setAccountType(type);
    // Default: asset/expense → -1 (borrower positive), liability/equity/revenue → +1 (creditor positive)
    if (type === "asset" || type === "expense") {
      setSign(-1);
    } else {
      setSign(1);
    }
  };

  const handleSubmit = async () => {
    setError(null);

    if (!displayCode.trim() || !name.trim()) {
      setError("コードと科目名は必須です");
      return;
    }

    setLoading(true);
    try {
      if (editCode) {
        await api.put(`/accounts/${editCode}`, {
          display_code: displayCode.trim(),
          name,
          account_type: accountType,
          sign,
          unit,
          parent_account_code: parentAccountCode && parentAccountCode !== "__none__" ? parentAccountCode : null,
        });
      } else {
        await api.post("/accounts", {
          display_code: displayCode.trim(),
          name: name.trim(),
          account_type: accountType,
          sign,
          unit,
          parent_account_code: parentAccountCode && parentAccountCode !== "__none__" ? parentAccountCode : undefined,
        });
      }
      onSuccess();
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存に失敗しました");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {editCode ? "勘定科目の編集" : "勘定科目の新規作成"}
          </DialogTitle>
          <DialogDescription>
            {editCode
              ? "勘定科目を更新します（新しいリビジョンが作成されます）"
              : "新しい勘定科目を作成します"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>コード</Label>
            <Input
              value={displayCode}
              onChange={(e) => setDisplayCode(e.target.value)}
              placeholder="例: 1000"
              className="font-mono"
            />
          </div>

          <div className="space-y-2">
            <Label>科目名</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例: 現金"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>分類</Label>
              <Select value={accountType} onValueChange={handleTypeChange}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ACCOUNT_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>符号</Label>
              <Select
                value={String(sign)}
                onValueChange={(v) => setSign(Number(v))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="-1">借方正 (-1)</SelectItem>
                  <SelectItem value="1">貸方正 (+1)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>通貨</Label>
            <Input
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              placeholder="JPY"
            />
          </div>

          <div className="space-y-2">
            <Label>親科目コード（任意）</Label>
            <Select
              value={parentAccountCode}
              onValueChange={setParentAccountCode}
            >
              <SelectTrigger>
                <SelectValue placeholder="なし" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">なし</SelectItem>
                {accounts
                  .filter((a) => a.is_active && a.code !== editCode)
                  .map((a) => (
                    <SelectItem key={a.code} value={a.code}>
                      {a.display_code} {a.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            キャンセル
          </Button>
          <Button onClick={handleSubmit} disabled={loading}>
            {loading ? "保存中..." : editCode ? "更新" : "作成"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
