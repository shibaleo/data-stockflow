"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { RefreshCw, Columns2, List } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { api, ApiError } from "@/lib/api-client";

// ── Types ──

interface BalanceItem {
  account_code: string;
  display_code: string;
  name: string;
  account_type: string;
  sign: number;
  parent_account_code: string | null;
  parent_display_code: string | null;
  balance: string;
}

type Tab = "bs" | "pl";
type ViewMode = "tree" | "t-account";

// ── Helpers ──

function formatAmount(amount: number): string {
  if (amount === 0) return "-";
  const abs = Math.abs(amount);
  const formatted = abs.toLocaleString("ja-JP");
  return amount < 0 ? `△${formatted}` : `¥${formatted}`;
}

interface TreeNode {
  code: string;
  displayCode: string;
  name: string;
  accountType: string;
  sign: number;
  parentCode: string | null;
  parentDisplayCode: string | null;
  ownBalance: number; // raw signed balance from DB
  subtotal: number; // display amount = sum of children * sign, or own * sign if leaf
  children: TreeNode[];
  depth: number;
  isLeaf: boolean;
}

function buildTree(items: BalanceItem[], types: string[]): TreeNode[] {
  const filtered = items.filter((i) => types.includes(i.account_type));
  const nodeMap = new Map<string, TreeNode>();

  // Create nodes
  for (const item of filtered) {
    nodeMap.set(item.account_code, {
      code: item.account_code,
      displayCode: item.display_code,
      name: item.name,
      accountType: item.account_type,
      sign: item.sign,
      parentCode: item.parent_account_code,
      parentDisplayCode: item.parent_display_code,
      ownBalance: Number(item.balance),
      subtotal: 0,
      children: [],
      depth: 0,
      isLeaf: true,
    });
  }

  // Link parent → children
  const roots: TreeNode[] = [];
  for (const node of nodeMap.values()) {
    if (node.parentCode && nodeMap.has(node.parentCode)) {
      const parent = nodeMap.get(node.parentCode)!;
      parent.children.push(node);
      parent.isLeaf = false;
    } else {
      roots.push(node);
    }
  }

  // Sort children by display_code
  function sortChildren(nodes: TreeNode[]) {
    nodes.sort((a, b) => a.displayCode.localeCompare(b.displayCode));
    for (const n of nodes) sortChildren(n.children);
  }
  sortChildren(roots);

  // Compute subtotals bottom-up (display amount = balance * sign)
  function computeSubtotal(node: TreeNode, depth: number): number {
    node.depth = depth;
    if (node.isLeaf) {
      node.subtotal = node.ownBalance * node.sign;
      return node.subtotal;
    }
    let sum = 0;
    for (const child of node.children) {
      sum += computeSubtotal(child, depth + 1);
    }
    // Parent might also have direct transactions (ownBalance)
    const ownDisplay = node.ownBalance * node.sign;
    node.subtotal = sum + ownDisplay;
    return node.subtotal;
  }

  for (const root of roots) computeSubtotal(root, 0);
  return roots;
}

function flattenTree(nodes: TreeNode[]): TreeNode[] {
  const result: TreeNode[] = [];
  function walk(list: TreeNode[]) {
    for (const n of list) {
      result.push(n);
      walk(n.children);
    }
  }
  walk(nodes);
  return result;
}

function sumRoots(roots: TreeNode[]): number {
  return roots.reduce((s, r) => s + r.subtotal, 0);
}

// ── Main Page ──

export default function ReportsPage() {
  const [data, setData] = useState<BalanceItem[]>([]);
  const [periods, setPeriods] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("pl");
  const [viewMode, setViewMode] = useState<ViewMode>("tree");

  // Period filter state
  const [periodFrom, setPeriodFrom] = useState<string>("__all__");
  const [periodTo, setPeriodTo] = useState<string>("__all__");

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (periodFrom !== "__all__") params.set("period_from", periodFrom);
      if (periodTo !== "__all__") params.set("period_to", periodTo);
      const qs = params.toString();
      const res = await api.get<{ data: BalanceItem[]; periods: string[] }>(
        `/reports/balances${qs ? `?${qs}` : ""}`
      );
      setData(res.data);
      setPeriods(res.periods);
    } catch (e) {
      const msg =
        e instanceof ApiError ? e.body.error : "データの取得に失敗しました";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, [periodFrom, periodTo]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Build trees
  const assetTree = useMemo(
    () => buildTree(data, ["asset"]),
    [data]
  );
  const liabilityTree = useMemo(
    () => buildTree(data, ["liability"]),
    [data]
  );
  const equityTree = useMemo(
    () => buildTree(data, ["equity"]),
    [data]
  );
  const revenueTree = useMemo(
    () => buildTree(data, ["revenue"]),
    [data]
  );
  const expenseTree = useMemo(
    () => buildTree(data, ["expense"]),
    [data]
  );

  const assetTotal = sumRoots(assetTree);
  const liabilityTotal = sumRoots(liabilityTree);
  const equityTotal = sumRoots(equityTree);
  const revenueTotal = sumRoots(revenueTree);
  const expenseTotal = sumRoots(expenseTree);
  const netIncome = revenueTotal - expenseTotal;

  return (
    <div className="p-4 md:p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold">財務レポート</h2>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setViewMode(viewMode === "tree" ? "t-account" : "tree")}
            title={viewMode === "tree" ? "T勘定ビュー" : "ツリービュー"}
          >
            {viewMode === "tree" ? (
              <Columns2 className="h-4 w-4" />
            ) : (
              <List className="h-4 w-4" />
            )}
          </Button>
          <Button variant="outline" size="sm" onClick={fetchData}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Period filter */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <span className="text-sm text-muted-foreground">期間:</span>
        <Select value={periodFrom} onValueChange={setPeriodFrom}>
          <SelectTrigger className="w-36 h-8 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">最初から</SelectItem>
            {periods.map((p) => (
              <SelectItem key={p} value={p}>
                {p}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-muted-foreground">〜</span>
        <Select value={periodTo} onValueChange={setPeriodTo}>
          <SelectTrigger className="w-36 h-8 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">最新まで</SelectItem>
            {periods.map((p) => (
              <SelectItem key={p} value={p}>
                {p}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Tab switcher */}
      <div className="flex gap-2 mb-6">
        {(
          [
            ["bs", "B/S 貸借対照表"],
            ["pl", "P/L 損益計算書"],
          ] as [Tab, string][]
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
              tab === key
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-accent"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-12 text-muted-foreground">
          読み込み中...
        </div>
      ) : viewMode === "tree" ? (
        tab === "bs" ? (
          <TreeBalanceSheet
            assetTree={assetTree}
            liabilityTree={liabilityTree}
            equityTree={equityTree}
            assetTotal={assetTotal}
            liabilityTotal={liabilityTotal}
            equityTotal={equityTotal}
            netIncome={netIncome}
          />
        ) : (
          <TreeProfitLoss
            revenueTree={revenueTree}
            expenseTree={expenseTree}
            revenueTotal={revenueTotal}
            expenseTotal={expenseTotal}
            netIncome={netIncome}
          />
        )
      ) : tab === "bs" ? (
        <TAccountBalanceSheet
          assetTree={assetTree}
          liabilityTree={liabilityTree}
          equityTree={equityTree}
          assetTotal={assetTotal}
          liabilityTotal={liabilityTotal}
          equityTotal={equityTotal}
          netIncome={netIncome}
        />
      ) : (
        <TAccountProfitLoss
          revenueTree={revenueTree}
          expenseTree={expenseTree}
          revenueTotal={revenueTotal}
          expenseTotal={expenseTotal}
          netIncome={netIncome}
        />
      )}
    </div>
  );
}

// ── Tree View Components ──

function TreeSection({
  title,
  roots,
  total,
  badge,
}: {
  title: string;
  roots: TreeNode[];
  total: number;
  badge?: string;
}) {
  const flat = flattenTree(roots);
  return (
    <div className="mb-6">
      <div className="flex items-center gap-2 mb-2">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
          {title}
        </h3>
        {badge && (
          <Badge className="bg-muted text-muted-foreground text-xs">
            {badge}
          </Badge>
        )}
      </div>
      <div className="border border-border rounded-md overflow-hidden">
        <table className="w-full text-sm">
          <tbody>
            {flat.map((node) => (
              <tr
                key={node.code}
                className={`border-b border-border/30 hover:bg-accent/20 transition-colors ${
                  !node.isLeaf ? "font-medium" : ""
                }`}
              >
                <td
                  className="py-2 px-3"
                  style={{ paddingLeft: `${node.depth * 24 + 12}px` }}
                >
                  <span className="font-mono text-xs text-muted-foreground mr-2">
                    {node.displayCode}
                  </span>
                  {node.name}
                </td>
                <td className="py-2 px-3 text-right font-mono whitespace-nowrap w-40">
                  {formatAmount(node.subtotal)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-muted/50 font-semibold">
              <td className="py-2 px-3">{title}合計</td>
              <td className="py-2 px-3 text-right font-mono whitespace-nowrap w-40">
                {formatAmount(total)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

function TreeBalanceSheet({
  assetTree,
  liabilityTree,
  equityTree,
  assetTotal,
  liabilityTotal,
  equityTotal,
  netIncome,
}: {
  assetTree: TreeNode[];
  liabilityTree: TreeNode[];
  equityTree: TreeNode[];
  assetTotal: number;
  liabilityTotal: number;
  equityTotal: number;
  netIncome: number;
}) {
  return (
    <div>
      <TreeSection title="資産の部" roots={assetTree} total={assetTotal} />
      <TreeSection
        title="負債の部"
        roots={liabilityTree}
        total={liabilityTotal}
      />
      <TreeSection title="純資産の部" roots={equityTree} total={equityTotal} />

      {/* Net income as equity addition */}
      <div className="border border-border rounded-md overflow-hidden mb-6">
        <table className="w-full text-sm">
          <tbody>
            <tr className="bg-muted/30 font-medium">
              <td className="py-2 px-3" style={{ paddingLeft: "36px" }}>
                当期損益（P/L差額）
              </td>
              <td className="py-2 px-3 text-right font-mono whitespace-nowrap w-40">
                {formatAmount(netIncome)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Grand totals */}
      <div className="border-t-2 border-border pt-4 space-y-2">
        <div className="flex justify-between text-sm font-bold px-3">
          <span>資産合計</span>
          <span className="font-mono">{formatAmount(assetTotal)}</span>
        </div>
        <div className="flex justify-between text-sm font-bold px-3">
          <span>負債・純資産合計</span>
          <span className="font-mono">
            {formatAmount(liabilityTotal + equityTotal + netIncome)}
          </span>
        </div>
        {assetTotal !== liabilityTotal + equityTotal + netIncome && (
          <div className="text-xs text-destructive px-3">
            差額:{" "}
            {formatAmount(
              assetTotal - (liabilityTotal + equityTotal + netIncome)
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function TreeProfitLoss({
  revenueTree,
  expenseTree,
  revenueTotal,
  expenseTotal,
  netIncome,
}: {
  revenueTree: TreeNode[];
  expenseTree: TreeNode[];
  revenueTotal: number;
  expenseTotal: number;
  netIncome: number;
}) {
  return (
    <div>
      <TreeSection title="収益の部" roots={revenueTree} total={revenueTotal} />
      <TreeSection title="費用の部" roots={expenseTree} total={expenseTotal} />

      <div className="border-t-2 border-border pt-4">
        <div className="flex justify-between text-sm font-bold px-3">
          <span>当期損益</span>
          <span className="font-mono">{formatAmount(netIncome)}</span>
        </div>
      </div>
    </div>
  );
}

// ── T-Account View Components ──

function TAccountSide({
  title,
  roots,
  total,
}: {
  title: string;
  roots: TreeNode[];
  total: number;
}) {
  const flat = flattenTree(roots);
  return (
    <div className="flex-1 min-w-0">
      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 text-center">
        {title}
      </h4>
      <div className="border border-border rounded-md overflow-hidden">
        <table className="w-full text-sm">
          <tbody>
            {flat.map((node) => (
              <tr
                key={node.code}
                className={`border-b border-border/30 ${
                  !node.isLeaf ? "font-medium" : ""
                }`}
              >
                <td
                  className="py-1.5 px-2 text-xs truncate"
                  style={{ paddingLeft: `${node.depth * 16 + 8}px` }}
                >
                  <span className="font-mono text-muted-foreground mr-1">
                    {node.displayCode}
                  </span>
                  {node.name}
                </td>
                <td className="py-1.5 px-2 text-right font-mono whitespace-nowrap text-xs w-28">
                  {formatAmount(node.subtotal)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-muted/50 font-semibold">
              <td className="py-1.5 px-2 text-xs">合計</td>
              <td className="py-1.5 px-2 text-right font-mono whitespace-nowrap text-xs w-28">
                {formatAmount(total)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

function TAccountBalanceSheet({
  assetTree,
  liabilityTree,
  equityTree,
  assetTotal,
  liabilityTotal,
  equityTotal,
  netIncome,
}: {
  assetTree: TreeNode[];
  liabilityTree: TreeNode[];
  equityTree: TreeNode[];
  assetTotal: number;
  liabilityTotal: number;
  equityTotal: number;
  netIncome: number;
}) {
  return (
    <div>
      <div className="flex gap-4">
        {/* Debit side = Assets */}
        <TAccountSide
          title="借方（資産）"
          roots={assetTree}
          total={assetTotal}
        />

        {/* Divider */}
        <div className="w-px bg-border self-stretch" />

        {/* Credit side = Liabilities + Equity */}
        <div className="flex-1 min-w-0 space-y-3">
          <TAccountSide
            title="貸方（負債）"
            roots={liabilityTree}
            total={liabilityTotal}
          />
          <TAccountSide
            title="貸方（純資産）"
            roots={equityTree}
            total={equityTotal}
          />
          {/* Net income */}
          <div className="border border-border rounded-md overflow-hidden">
            <table className="w-full text-sm">
              <tbody>
                <tr className="bg-muted/30 font-medium">
                  <td className="py-1.5 px-2 text-xs">当期損益</td>
                  <td className="py-1.5 px-2 text-right font-mono whitespace-nowrap text-xs w-28">
                    {formatAmount(netIncome)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Balance check */}
      <div className="flex gap-4 mt-4 border-t-2 border-border pt-3">
        <div className="flex-1 text-center text-sm font-bold">
          <span className="text-muted-foreground mr-2">借方合計:</span>
          <span className="font-mono">{formatAmount(assetTotal)}</span>
        </div>
        <div className="flex-1 text-center text-sm font-bold">
          <span className="text-muted-foreground mr-2">貸方合計:</span>
          <span className="font-mono">
            {formatAmount(liabilityTotal + equityTotal + netIncome)}
          </span>
        </div>
      </div>
    </div>
  );
}

function TAccountProfitLoss({
  revenueTree,
  expenseTree,
  revenueTotal,
  expenseTotal,
  netIncome,
}: {
  revenueTree: TreeNode[];
  expenseTree: TreeNode[];
  revenueTotal: number;
  expenseTotal: number;
  netIncome: number;
}) {
  return (
    <div>
      <div className="flex gap-4">
        {/* Debit side = Expenses */}
        <div className="flex-1 min-w-0 space-y-3">
          <TAccountSide
            title="借方（費用）"
            roots={expenseTree}
            total={expenseTotal}
          />
          {/* Net income on debit side if positive (profit) */}
          {netIncome > 0 && (
            <div className="border border-border rounded-md overflow-hidden">
              <table className="w-full text-sm">
                <tbody>
                  <tr className="bg-green-900/20 font-medium">
                    <td className="py-1.5 px-2 text-xs">当期利益</td>
                    <td className="py-1.5 px-2 text-right font-mono whitespace-nowrap text-xs w-28">
                      {formatAmount(netIncome)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Divider */}
        <div className="w-px bg-border self-stretch" />

        {/* Credit side = Revenue */}
        <div className="flex-1 min-w-0 space-y-3">
          <TAccountSide
            title="貸方（収益）"
            roots={revenueTree}
            total={revenueTotal}
          />
          {/* Net loss on credit side if negative */}
          {netIncome < 0 && (
            <div className="border border-border rounded-md overflow-hidden">
              <table className="w-full text-sm">
                <tbody>
                  <tr className="bg-red-900/20 font-medium">
                    <td className="py-1.5 px-2 text-xs">当期損失</td>
                    <td className="py-1.5 px-2 text-right font-mono whitespace-nowrap text-xs w-28">
                      {formatAmount(Math.abs(netIncome))}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Balance check */}
      <div className="flex gap-4 mt-4 border-t-2 border-border pt-3">
        <div className="flex-1 text-center text-sm font-bold">
          <span className="text-muted-foreground mr-2">借方合計:</span>
          <span className="font-mono">
            {formatAmount(expenseTotal + Math.max(0, netIncome))}
          </span>
        </div>
        <div className="flex-1 text-center text-sm font-bold">
          <span className="text-muted-foreground mr-2">貸方合計:</span>
          <span className="font-mono">
            {formatAmount(revenueTotal + Math.max(0, -netIncome))}
          </span>
        </div>
      </div>
    </div>
  );
}
