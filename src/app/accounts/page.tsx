"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Plus, Pencil, Trash2, RefreshCw, Undo2, ChevronRight, ChevronDown, X, Eye, EyeOff } from "lucide-react";
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
import { BookSelector } from "@/components/shared/book-selector";
import { useBooks } from "@/hooks/use-books";
import { api, ApiError } from "@/lib/api-client";

interface AccountRow {
  id: number;
  book_id: number;
  code: string;
  name: string;
  account_type: string;
  sign: number;
  is_active: boolean;
  parent_account_id: number | null;
  revision: number;
}

const ACCOUNT_TYPES = [
  { value: "asset", label: "資産" },
  { value: "liability", label: "負債" },
  { value: "equity", label: "純資産" },
  { value: "revenue", label: "収益" },
  { value: "expense", label: "費用" },
] as const;

const DEFAULT_TYPE_LABELS: Record<string, string> = {
  asset: "資産の部",
  liability: "負債の部",
  equity: "純資産の部",
  revenue: "収益の部",
  expense: "費用の部",
};

const TYPE_LABEL: Record<string, string> = {
  asset: "資産",
  liability: "負債",
  equity: "純資産",
  revenue: "収益",
  expense: "費用",
};

// ── Tree helpers ──

interface TreeNode {
  id: number;
  code: string;
  name: string;
  accountType: string;
  isActive: boolean;
  parentId: number | null;
  revision: number;
  children: TreeNode[];
  depth: number;
  hasChildren: boolean;
}

function buildTree(accounts: AccountRow[], types: string[]): TreeNode[] {
  const filtered = accounts.filter((a) => types.includes(a.account_type));
  const nodeMap = new Map<number, TreeNode>();

  for (const a of filtered) {
    nodeMap.set(a.id, {
      id: a.id,
      code: a.code,
      name: a.name,
      accountType: a.account_type,
      isActive: a.is_active,
      parentId: a.parent_account_id,
      revision: a.revision,
      children: [],
      depth: 0,
      hasChildren: false,
    });
  }

  const roots: TreeNode[] = [];
  for (const node of nodeMap.values()) {
    if (node.parentId && nodeMap.has(node.parentId)) {
      nodeMap.get(node.parentId)!.children.push(node);
      nodeMap.get(node.parentId)!.hasChildren = true;
    } else {
      roots.push(node);
    }
  }

  function sortAndSetDepth(nodes: TreeNode[], depth: number) {
    nodes.sort((a, b) => a.code.localeCompare(b.code));
    for (const n of nodes) {
      n.depth = depth;
      sortAndSetDepth(n.children, depth + 1);
    }
  }
  sortAndSetDepth(roots, 0);
  return roots;
}

function flattenTree(nodes: TreeNode[], collapsed: Set<number>): TreeNode[] {
  const result: TreeNode[] = [];
  function walk(list: TreeNode[]) {
    for (const n of list) {
      result.push(n);
      if (n.hasChildren && !collapsed.has(n.id)) {
        walk(n.children);
      }
    }
  }
  walk(nodes);
  return result;
}

// ── Main Page ──

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [showInactive, setShowInactive] = useState(false);

  const { books, selectedBookId, setSelectedBookId, selectedBook } = useBooks();

  const sections = useMemo(() => {
    const labels = selectedBook?.type_labels ?? {};
    return [
      { types: ["asset"], title: labels.asset || DEFAULT_TYPE_LABELS.asset },
      { types: ["liability"], title: labels.liability || DEFAULT_TYPE_LABELS.liability },
      { types: ["equity"], title: labels.equity || DEFAULT_TYPE_LABELS.equity },
      { types: ["revenue"], title: labels.revenue || DEFAULT_TYPE_LABELS.revenue },
      { types: ["expense"], title: labels.expense || DEFAULT_TYPE_LABELS.expense },
    ];
  }, [selectedBook]);

  const toggleCollapse = (id: number) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const trees = useMemo(
    () => sections.map((s) => ({ ...s, roots: buildTree(accounts, s.types) })),
    [accounts, sections],
  );

  const selectedAccount = useMemo(
    () => (selectedId ? accounts.find((a) => a.id === selectedId) ?? null : null),
    [accounts, selectedId],
  );

  const fetchAccounts = useCallback(async () => {
    if (!selectedBookId) return;
    setLoading(true);
    try {
      const qs = showInactive ? "&include_inactive=true" : "";
      const res = await api.get<{ data: AccountRow[] }>(
        `/books/${selectedBookId}/accounts?limit=200${qs}`
      );
      setAccounts(res.data);
    } catch (e) {
      const msg = e instanceof ApiError ? e.body.error : "勘定科目の取得に失敗しました";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, [selectedBookId, showInactive]);

  useEffect(() => {
    fetchAccounts();
  }, [fetchAccounts]);

  const handleCreate = () => {
    setEditId(null);
    setDialogOpen(true);
  };

  const handleEdit = (id: number) => {
    setEditId(id);
    setDialogOpen(true);
  };

  const handleDelete = async (id: number) => {
    if (!confirm("この勘定科目を無効化しますか？")) return;
    try {
      await api.delete(`/books/${selectedBookId}/accounts/${id}`);
      toast.success("勘定科目を無効化しました");
      fetchAccounts();
    } catch (e) {
      const msg = e instanceof ApiError ? e.body.error : "無効化に失敗しました";
      toast.error(msg);
    }
  };

  const handleRestore = async (id: number) => {
    try {
      await api.post(`/books/${selectedBookId}/accounts/${id}/restore`, {});
      toast.success("勘定科目を復元しました");
      fetchAccounts();
    } catch (e) {
      const msg = e instanceof ApiError ? e.body.error : "復元に失敗しました";
      toast.error(msg);
    }
  };

  const handleSuccess = () => {
    toast.success(editId ? "勘定科目を更新しました" : "勘定科目を作成しました");
    setDialogOpen(false);
    fetchAccounts();
  };

  return (
    <div className="p-4 md:p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <h2 className="text-xl font-semibold">科目</h2>
          <BookSelector
            books={books}
            selectedBookId={selectedBookId}
            onValueChange={setSelectedBookId}
          />
        </div>
        <div className="flex gap-2">
          <Button
            variant={showInactive ? "secondary" : "outline"}
            size="sm"
            onClick={() => setShowInactive((v) => !v)}
          >
            {showInactive ? <EyeOff className="h-4 w-4 mr-1" /> : <Eye className="h-4 w-4 mr-1" />}
            削除済みを表示
          </Button>
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
        <div className="text-center py-12 text-muted-foreground">読み込み中...</div>
      ) : accounts.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">勘定科目がありません</div>
      ) : (
        <div className="flex gap-6">
          {/* Tree sections */}
          <div className="flex-1 min-w-0 space-y-6">
            {trees.map(({ title, roots }) => {
              if (roots.length === 0) return null;
              const flat = flattenTree(roots, collapsed);
              return (
                <AccountSection
                  key={title}
                  title={title}
                  nodes={flat}
                  collapsed={collapsed}
                  selectedId={selectedId}
                  onToggleCollapse={toggleCollapse}
                  onSelect={setSelectedId}
                />
              );
            })}
          </div>

          {/* Property panel */}
          {selectedAccount && (
            <AccountPropertyPanel
              account={selectedAccount}
              accounts={accounts}
              onClose={() => setSelectedId(null)}
              onEdit={() => handleEdit(selectedAccount.id)}
              onDelete={() => handleDelete(selectedAccount.id)}
              onRestore={() => handleRestore(selectedAccount.id)}
            />
          )}
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
        editId={editId}
        accounts={accounts}
        bookId={selectedBookId}
        onSuccess={handleSuccess}
      />
    </div>
  );
}

// ── Account Section (per account_type group) ──

function AccountSection({
  title,
  nodes,
  collapsed,
  selectedId,
  onToggleCollapse,
  onSelect,
}: {
  title: string;
  nodes: TreeNode[];
  collapsed: Set<number>;
  selectedId: number | null;
  onToggleCollapse: (id: number) => void;
  onSelect: (id: number) => void;
}) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-2">
        {title}
      </h3>
      <div className="border border-border rounded-md overflow-hidden">
        <table className="w-full text-sm">
          <tbody>
            {nodes.map((node) => (
              <tr
                key={node.id}
                className={`border-b border-border/30 transition-colors cursor-pointer ${
                  !node.isActive ? "opacity-50" : ""
                } ${selectedId === node.id ? "bg-accent" : "hover:bg-accent/20"}`}
                onClick={() => onSelect(node.id)}
              >
                <td
                  className="py-2 px-3"
                  style={{ paddingLeft: `${node.depth * 24 + 12}px` }}
                >
                  <div className="flex items-center">
                    {node.hasChildren ? (
                      <button
                        className="mr-1.5 text-muted-foreground hover:text-foreground transition-colors"
                        onClick={(e) => {
                          e.stopPropagation();
                          onToggleCollapse(node.id);
                        }}
                      >
                        {collapsed.has(node.id) ? (
                          <ChevronRight className="h-4 w-4" />
                        ) : (
                          <ChevronDown className="h-4 w-4" />
                        )}
                      </button>
                    ) : node.depth > 0 ? (
                      <span className="mr-1.5 w-4 text-center text-muted-foreground/40">└</span>
                    ) : (
                      <span className="mr-1.5 w-4" />
                    )}
                    <span className="font-mono text-xs text-muted-foreground mr-2">
                      {node.code}
                    </span>
                    <span className={node.hasChildren ? "font-medium" : ""}>
                      {node.name}
                    </span>
                    {!node.isActive && (
                      <Badge className="ml-2 bg-red-900/30 text-red-400 border-red-800/50 text-xs py-0">
                        無効
                      </Badge>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Property Panel ──

function AccountPropertyPanel({
  account,
  accounts,
  onClose,
  onEdit,
  onDelete,
  onRestore,
}: {
  account: AccountRow;
  accounts: AccountRow[];
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onRestore: () => void;
}) {
  const parent = account.parent_account_id
    ? accounts.find((a) => a.id === account.parent_account_id)
    : null;
  const children = accounts.filter((a) => a.parent_account_id === account.id);

  return (
    <div className="w-80 shrink-0 border border-border rounded-md p-4 space-y-4 self-start sticky top-6">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-base truncate">{account.name}</h3>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="space-y-3 text-sm">
        <PropertyRow label="コード" value={account.code} mono />
        <PropertyRow label="ID" value={String(account.id)} mono />
        <PropertyRow label="分類">
          <Badge variant="secondary">{TYPE_LABEL[account.account_type] || account.account_type}</Badge>
        </PropertyRow>
        <PropertyRow label="状態">
          {account.is_active ? (
            <Badge className="bg-green-900/30 text-green-400 border-green-800/50">有効</Badge>
          ) : (
            <Badge className="bg-red-900/30 text-red-400 border-red-800/50">無効</Badge>
          )}
        </PropertyRow>
        <PropertyRow label="リビジョン" value={String(account.revision)} mono />
        <PropertyRow label="親科目">
          {parent ? (
            <span className="text-xs">
              <span className="font-mono text-muted-foreground mr-1">{parent.code}</span>
              {parent.name}
            </span>
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
        </PropertyRow>

        {children.length > 0 && (
          <div>
            <span className="text-muted-foreground text-xs">子科目</span>
            <div className="mt-1 space-y-0.5">
              {children.map((child) => (
                <div key={child.id} className="text-xs flex items-center gap-1">
                  <span className="font-mono text-muted-foreground">{child.code}</span>
                  <span className={!child.is_active ? "opacity-50" : ""}>{child.name}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="flex gap-2 pt-2 border-t border-border">
        {account.is_active ? (
          <>
            <Button variant="outline" size="sm" className="flex-1" onClick={onEdit}>
              <Pencil className="h-3.5 w-3.5 mr-1" />
              編集
            </Button>
            <Button variant="outline" size="sm" onClick={onDelete}>
              <Trash2 className="h-3.5 w-3.5 text-destructive" />
            </Button>
          </>
        ) : (
          <Button variant="outline" size="sm" className="flex-1" onClick={onRestore}>
            <Undo2 className="h-3.5 w-3.5 mr-1 text-green-400" />
            復元
          </Button>
        )}
      </div>
    </div>
  );
}

function PropertyRow({
  label,
  value,
  mono,
  children,
}: {
  label: string;
  value?: string;
  mono?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-2">
      <span className="text-muted-foreground text-xs shrink-0">{label}</span>
      {children ?? (
        <span className={`text-right ${mono ? "font-mono text-xs" : "text-sm"}`}>{value}</span>
      )}
    </div>
  );
}

// ── Account Dialog ──

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editId: number | null;
  accounts: AccountRow[];
  bookId: string;
  onSuccess: () => void;
}

function AccountDialog({
  open,
  onOpenChange,
  editId,
  accounts,
  bookId,
  onSuccess,
}: DialogProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [accountType, setAccountType] = useState("asset");
  const [parentAccountId, setParentAccountId] = useState("__none__");

  useEffect(() => {
    if (!open) {
      setCode("");
      setName("");
      setAccountType("asset");
      setParentAccountId("__none__");
      setError(null);
      return;
    }
    if (!editId) return;

    const existing = accounts.find((a) => a.id === editId);
    if (existing) {
      setCode(existing.code);
      setName(existing.name);
      setAccountType(existing.account_type);
      setParentAccountId(existing.parent_account_id ? String(existing.parent_account_id) : "__none__");
    }
  }, [open, editId, accounts]);

  const handleSubmit = async () => {
    setError(null);

    if (!code.trim() || !name.trim()) {
      setError("コードと科目名は必須です");
      return;
    }

    setLoading(true);
    try {
      const parentId = parentAccountId !== "__none__" ? Number(parentAccountId) : undefined;
      if (editId) {
        await api.put(`/books/${bookId}/accounts/${editId}`, {
          code: code.trim(),
          name,
          account_type: accountType,
          parent_account_id: parentId ?? null,
        });
      } else {
        await api.post(`/books/${bookId}/accounts`, {
          code: code.trim(),
          name: name.trim(),
          account_type: accountType,
          parent_account_id: parentId,
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
            {editId ? "勘定科目の編集" : "勘定科目の新規作成"}
          </DialogTitle>
          <DialogDescription>
            {editId
              ? "勘定科目を更新します（新しいリビジョンが作成されます）"
              : "新しい勘定科目を作成します"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>コード</Label>
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value)}
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

          <div className="space-y-2">
            <Label>分類</Label>
            <Select value={accountType} onValueChange={setAccountType}>
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
            <Label>親科目（任意）</Label>
            <Select
              value={parentAccountId}
              onValueChange={setParentAccountId}
            >
              <SelectTrigger>
                <SelectValue placeholder="なし" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">なし</SelectItem>
                {accounts
                  .filter((a) => a.is_active && a.id !== editId)
                  .map((a) => (
                    <SelectItem key={a.id} value={String(a.id)}>
                      {a.code} {a.name}
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
            {loading ? "保存中..." : editId ? "更新" : "作成"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
