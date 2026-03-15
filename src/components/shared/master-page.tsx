"use client";

import { useState, useEffect, useCallback, useMemo, type ReactNode } from "react";
import {
  Plus,
  Pencil,
  Trash2,
  RefreshCw,
  Undo2,
  ChevronRight,
  ChevronDown,
  X,
  Eye,
  EyeOff,
} from "lucide-react";
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

// ── Types ──

export interface MasterRow {
  id: number;
  code: string;
  name: string;
  is_active: boolean;
  [key: string]: unknown;
}

export interface ExtraField {
  key: string;
  label: string;
  type: "text" | "date" | "select";
  placeholder?: string;
  options?: { value: string; label: string }[];
  format?: (value: unknown) => string;
  apiKey?: string;
}

export interface GroupConfig {
  /** Field to group by */
  field: string;
  /** Sections: [field_value, display_label] */
  sections: [string, string][];
}

export interface MasterPageConfig {
  title: string;
  endpoint: string;
  parentKey?: string;
  entityName: string;
  extraFields?: ExtraField[];
  codePlaceholder?: string;
  namePlaceholder?: string;
  /** Group items into sections (like account_type) */
  groupBy?: GroupConfig;
  /** Extra dialog fields (e.g., account_type Select) */
  dialogExtraFields?: ExtraField[];
}

// ── Tree ──

export interface TreeNode {
  id: number;
  code: string;
  name: string;
  isActive: boolean;
  parentId: number | null;
  data: MasterRow;
  children: TreeNode[];
  depth: number;
  hasChildren: boolean;
}

export function buildTree(items: MasterRow[], parentKey: string): TreeNode[] {
  const nodeMap = new Map<number, TreeNode>();
  for (const item of items) {
    nodeMap.set(item.id, {
      id: item.id, code: item.code, name: item.name, isActive: item.is_active,
      parentId: (item[parentKey] as number | null) ?? null,
      data: item, children: [], depth: 0, hasChildren: false,
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
    for (const n of nodes) { n.depth = depth; sortAndSetDepth(n.children, depth + 1); }
  }
  sortAndSetDepth(roots, 0);
  return roots;
}

export function flattenTree(nodes: TreeNode[], collapsed: Set<number>): TreeNode[] {
  const result: TreeNode[] = [];
  function walk(list: TreeNode[]) {
    for (const n of list) {
      result.push(n);
      if (n.hasChildren && !collapsed.has(n.id)) walk(n.children);
    }
  }
  walk(nodes);
  return result;
}

// ── Tree Section (reusable) ──

export function MasterTreeSection({
  title,
  nodes,
  collapsed,
  selectedId,
  onToggleCollapse,
  onSelect,
  extraFields,
}: {
  title?: string;
  nodes: TreeNode[];
  collapsed: Set<number>;
  selectedId: number | null;
  onToggleCollapse: (id: number) => void;
  onSelect: (id: number) => void;
  extraFields?: ExtraField[];
}) {
  return (
    <div>
      {title && (
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-2">
          {title}
        </h3>
      )}
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
                <td className="py-2 px-3" style={{ paddingLeft: `${node.depth * 24 + 12}px` }}>
                  <div className="flex items-center">
                    {node.hasChildren ? (
                      <button
                        className="mr-1.5 text-muted-foreground hover:text-foreground transition-colors"
                        onClick={(e) => { e.stopPropagation(); onToggleCollapse(node.id); }}
                      >
                        {collapsed.has(node.id) ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </button>
                    ) : node.depth > 0 ? (
                      <span className="mr-1.5 w-4 text-center text-muted-foreground/40">└</span>
                    ) : (
                      <span className="mr-1.5 w-4" />
                    )}
                    <span className="font-mono text-xs text-muted-foreground mr-2">{node.code}</span>
                    <span className={node.hasChildren ? "font-medium" : ""}>{node.name}</span>
                    {!node.isActive && (
                      <Badge className="ml-2 bg-red-900/30 text-red-400 border-red-800/50 text-xs py-0">無効</Badge>
                    )}
                    {extraFields?.map((field) => {
                      const val = node.data[field.key];
                      if (!val) return null;
                      return (
                        <Badge key={field.key} variant="outline" className="ml-2 text-xs py-0">
                          {field.format ? field.format(val) : String(val)}
                        </Badge>
                      );
                    })}
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

// ── Property Panel (reusable) ──

export function MasterPropertyPanel({
  item,
  items,
  parentKey,
  extraFields,
  onClose,
  onEdit,
  onDelete,
  onRestore,
  extraContent,
}: {
  item: MasterRow;
  items: MasterRow[];
  parentKey?: string;
  extraFields?: ExtraField[];
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onRestore: () => void;
  extraContent?: ReactNode;
}) {
  const pk = parentKey ?? "parent_id";
  const parentId = item[pk] as number | null;
  const parent = parentId ? items.find((a) => a.id === parentId) : null;
  const children = items.filter((a) => (a[pk] as number | null) === item.id);

  return (
    <div className="w-80 shrink-0 border border-border rounded-md p-4 space-y-4 self-start sticky top-6">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-base truncate">{item.name}</h3>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="space-y-3 text-sm">
        <PropRow label="コード" value={item.code} mono />
        <PropRow label="状態">
          {item.is_active
            ? <Badge className="bg-green-900/30 text-green-400 border-green-800/50">有効</Badge>
            : <Badge className="bg-red-900/30 text-red-400 border-red-800/50">無効</Badge>}
        </PropRow>

        {parentKey && (
          <PropRow label="親">
            {parent ? (
              <span className="text-xs">
                <span className="font-mono text-muted-foreground mr-1">{parent.code}</span>
                {parent.name}
              </span>
            ) : <span className="text-muted-foreground">—</span>}
          </PropRow>
        )}

        {extraFields?.map((field) => {
          const val = item[field.key];
          const display = val ? (field.format ? field.format(val) : String(val)) : "—";
          return <PropRow key={field.key} label={field.label} value={display} />;
        })}

        {extraContent}

        {children.length > 0 && (
          <div>
            <span className="text-muted-foreground text-xs">子要素</span>
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
        {item.is_active ? (
          <>
            <Button variant="outline" size="sm" className="flex-1" onClick={onEdit}>
              <Pencil className="h-3.5 w-3.5 mr-1" />編集
            </Button>
            <Button variant="outline" size="sm" onClick={onDelete}>
              <Trash2 className="h-3.5 w-3.5 text-destructive" />
            </Button>
          </>
        ) : (
          <Button variant="outline" size="sm" className="flex-1" onClick={onRestore}>
            <Undo2 className="h-3.5 w-3.5 mr-1 text-green-400" />復元
          </Button>
        )}
      </div>
    </div>
  );
}

export function PropRow({ label, value, mono, children }: {
  label: string; value?: string; mono?: boolean; children?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-2">
      <span className="text-muted-foreground text-xs shrink-0">{label}</span>
      {children ?? <span className={`text-right ${mono ? "font-mono text-xs" : "text-sm"}`}>{value}</span>}
    </div>
  );
}

// ── Dialog (reusable) ──

export function MasterDialog({
  open,
  onOpenChange,
  editId,
  items,
  config,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editId: number | null;
  items: MasterRow[];
  config: MasterPageConfig;
  onSuccess: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [parentId, setParentId] = useState("__none__");
  const [extras, setExtras] = useState<Record<string, string>>({});

  const parentKey = config.parentKey ?? "parent_id";
  const allExtraFields = [...(config.dialogExtraFields ?? []), ...(config.extraFields ?? [])];

  useEffect(() => {
    if (!open) { setCode(""); setName(""); setParentId("__none__"); setExtras({}); setError(null); return; }
    if (!editId) return;
    const existing = items.find((c) => c.id === editId);
    if (existing) {
      setCode(existing.code);
      setName(existing.name);
      const pid = existing[parentKey] as number | null;
      setParentId(pid ? String(pid) : "__none__");
      const ex: Record<string, string> = {};
      for (const field of allExtraFields) {
        const val = existing[field.key];
        if (field.type === "date" && val) { ex[field.key] = String(val).slice(0, 10); }
        else { ex[field.key] = val ? String(val) : ""; }
      }
      setExtras(ex);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editId]);

  const handleSubmit = async () => {
    setError(null);
    if (!code.trim() || !name.trim()) { setError("コードと名前は必須です"); return; }
    setLoading(true);
    try {
      const payload: Record<string, unknown> = { code: code.trim(), name: name.trim() };
      if (config.parentKey) {
        payload[config.parentKey] = parentId !== "__none__" ? Number(parentId) : null;
      }
      for (const field of allExtraFields) {
        const apiKey = field.apiKey ?? field.key;
        const val = extras[field.key];
        if (field.type === "date" && val) { payload[apiKey] = new Date(val).toISOString(); }
        else if (val) { payload[apiKey] = val; }
      }
      if (editId) {
        await api.put(`${config.endpoint}/${editId}`, payload);
      } else {
        await api.post(config.endpoint, payload);
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
          <DialogTitle>{editId ? `${config.entityName}の編集` : `${config.entityName}の新規作成`}</DialogTitle>
          <DialogDescription>{editId ? `${config.entityName}を更新します` : `新しい${config.entityName}を作成します`}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>コード</Label>
            <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder={config.codePlaceholder ?? "例: code-001"} className="font-mono" />
          </div>
          <div className="space-y-2">
            <Label>名前</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={config.namePlaceholder ?? "例: 名前"} />
          </div>

          {config.parentKey && (
            <div className="space-y-2">
              <Label>親（任意）</Label>
              <Select value={parentId} onValueChange={setParentId}>
                <SelectTrigger><SelectValue placeholder="なし" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">なし</SelectItem>
                  {items.filter((a) => a.is_active && a.id !== editId).map((a) => (
                    <SelectItem key={a.id} value={String(a.id)}>{a.code} {a.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {allExtraFields.map((field) => (
            <div key={field.key} className="space-y-2">
              <Label>{field.label}</Label>
              {field.type === "select" && field.options ? (
                <Select value={extras[field.key] || ""} onValueChange={(v) => setExtras((prev) => ({ ...prev, [field.key]: v }))}>
                  <SelectTrigger><SelectValue placeholder={field.placeholder ?? "選択"} /></SelectTrigger>
                  <SelectContent>
                    {field.options.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input type={field.type === "date" ? "date" : "text"} value={extras[field.key] || ""}
                  onChange={(e) => setExtras((prev) => ({ ...prev, [field.key]: e.target.value }))}
                  placeholder={field.placeholder} />
              )}
            </div>
          ))}

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>キャンセル</Button>
          <Button onClick={handleSubmit} disabled={loading}>{loading ? "保存中..." : editId ? "更新" : "作成"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Full MasterPage (uses above parts) ──

export function MasterPage({ config, headerSlot }: {
  config: MasterPageConfig;
  headerSlot?: ReactNode;
}) {
  const [items, setItems] = useState<MasterRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [showInactive, setShowInactive] = useState(false);

  const parentKey = config.parentKey ?? "parent_id";

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const qs = showInactive ? "?limit=200&include_inactive=true" : "?limit=200";
      const res = await api.get<{ data: MasterRow[] }>(`${config.endpoint}${qs}`);
      setItems(res.data);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.body.error : `${config.entityName}の取得に失敗しました`);
    } finally {
      setLoading(false);
    }
  }, [config.endpoint, config.entityName, showInactive]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  const toggleCollapse = (id: number) => {
    setCollapsed((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  };

  const selectedItem = useMemo(() => selectedId ? items.find((a) => a.id === selectedId) ?? null : null, [items, selectedId]);

  // Group or single tree
  const sections = useMemo(() => {
    if (config.groupBy) {
      return config.groupBy.sections.map(([value, title]) => {
        const filtered = items.filter((i) => i[config.groupBy!.field] === value);
        const roots = buildTree(filtered, parentKey);
        return { title, roots };
      });
    }
    return [{ title: undefined as string | undefined, roots: buildTree(items, parentKey) }];
  }, [items, parentKey, config.groupBy]);

  const handleCreate = () => { setEditId(null); setDialogOpen(true); };
  const handleEdit = (id: number) => { setEditId(id); setDialogOpen(true); };
  const handleDelete = async (id: number) => {
    if (!confirm(`この${config.entityName}を無効化しますか？`)) return;
    try { await api.delete(`${config.endpoint}/${id}`); toast.success(`${config.entityName}を無効化しました`); fetchItems(); }
    catch (e) { toast.error(e instanceof ApiError ? e.body.error : "無効化に失敗しました"); }
  };
  const handleRestore = async (id: number) => {
    try { await api.post(`${config.endpoint}/${id}/restore`, {}); toast.success(`${config.entityName}を復元しました`); fetchItems(); }
    catch (e) { toast.error(e instanceof ApiError ? e.body.error : "復元に失敗しました"); }
  };
  const handleSuccess = () => {
    toast.success(editId ? `${config.entityName}を更新しました` : `${config.entityName}を作成しました`);
    setDialogOpen(false);
    fetchItems();
  };

  return (
    <div className="p-4 md:p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <h2 className="text-xl font-semibold">{config.title}</h2>
          {headerSlot}
        </div>
        <div className="flex gap-2">
          <Button variant={showInactive ? "secondary" : "outline"} size="sm" onClick={() => setShowInactive((v) => !v)}>
            {showInactive ? <EyeOff className="h-4 w-4 mr-1" /> : <Eye className="h-4 w-4 mr-1" />}
            削除済み
          </Button>
          <Button variant="outline" size="sm" onClick={fetchItems}><RefreshCw className="h-4 w-4" /></Button>
          <Button size="sm" onClick={handleCreate}><Plus className="h-4 w-4 mr-1" />新規作成</Button>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12 text-muted-foreground">読み込み中...</div>
      ) : items.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">{config.entityName}がありません</div>
      ) : (
        <div className="flex gap-6">
          <div className="flex-1 min-w-0 space-y-6">
            {sections.map(({ title, roots }) => {
              if (roots.length === 0) return null;
              const flat = flattenTree(roots, collapsed);
              return (
                <MasterTreeSection
                  key={title ?? "_all"}
                  title={title}
                  nodes={flat}
                  collapsed={collapsed}
                  selectedId={selectedId}
                  onToggleCollapse={toggleCollapse}
                  onSelect={setSelectedId}
                  extraFields={config.extraFields}
                />
              );
            })}
          </div>
          {selectedItem && (
            <MasterPropertyPanel
              item={selectedItem}
              items={items}
              parentKey={config.parentKey}
              extraFields={config.extraFields}
              onClose={() => setSelectedId(null)}
              onEdit={() => handleEdit(selectedItem.id)}
              onDelete={() => handleDelete(selectedItem.id)}
              onRestore={() => handleRestore(selectedItem.id)}
            />
          )}
        </div>
      )}

      <Button className="fixed bottom-6 right-6 h-14 w-14 rounded-full shadow-lg" size="icon" onClick={handleCreate}>
        <Plus className="h-6 w-6" />
      </Button>

      <MasterDialog open={dialogOpen} onOpenChange={setDialogOpen} editId={editId} items={items} config={config} onSuccess={handleSuccess} />
    </div>
  );
}
