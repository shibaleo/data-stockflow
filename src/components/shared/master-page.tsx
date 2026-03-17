"use client";

import { useState, useEffect, useCallback, useMemo, type ReactNode } from "react";
import {
  Plus,
  Trash2,
  RefreshCw,
  Undo2,
  ChevronRight,
  ChevronDown,
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
import { api, ApiError, fetchAllPages } from "@/lib/api-client";

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
  /** Whether to wrap in a Badge in tree view (default: true) */
  badge?: boolean;
  /** Dynamic className for badge based on value */
  badgeClassName?: (value: unknown) => string;
  /** If true, adds a "none" option and sends null when selected */
  nullable?: boolean;
}

export interface GroupConfig {
  field: string;
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
  groupBy?: GroupConfig;
  dialogExtraFields?: ExtraField[];
  /** Extra dialog fields only for create (e.g., email for user invite) */
  createOnlyFields?: ExtraField[];
  icon?: ReactNode;
  createLabel?: string;
  /** Additional query params for the fetch (e.g., filter by type) */
  fetchParams?: Record<string, string>;
  /** Default extra field values for create (hidden from dialog) */
  defaultExtraValues?: Record<string, string>;
  /** Client-side filter applied after fetch */
  clientFilter?: (item: MasterRow) => boolean;
  /** If true, renders dialogExtraFields before the parent selector */
  extraFieldsFirst?: boolean;
  /** Filter parent candidates based on current dialog extras state */
  parentFilter?: (candidate: MasterRow, extras: Record<string, string>) => boolean;
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

// ── Tree Section ──

export function MasterTreeSection({
  title,
  nodes,
  collapsed,
  onToggleCollapse,
  onSelect,
  extraFields,
}: {
  title?: string;
  nodes: TreeNode[];
  collapsed: Set<number>;
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
                } hover:bg-accent/20`}
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
                    <span className="ml-auto flex items-center gap-1.5">
                      {!node.isActive && (
                        <Badge className="bg-red-900/30 text-red-400 border-red-800/50 text-xs py-0">無効</Badge>
                      )}
                      {extraFields?.map((field) => {
                        const val = node.data[field.key];
                        if (val == null) return null;
                        const text = field.format ? field.format(val) : String(val);
                        if (!text) return null;
                        if (field.badge === false) {
                          return <span key={field.key} className="text-xs text-muted-foreground">{text}</span>;
                        }
                        const badgeCls = field.badgeClassName ? field.badgeClassName(val) : "";
                        return (
                          <Badge key={field.key} variant="outline" className={`text-xs py-0 ${badgeCls}`}>
                            {text}
                          </Badge>
                        );
                      })}
                    </span>
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

// ── Extra Fields Block ──

function ExtraFieldsBlock({ fields, extras, setExtras }: {
  fields: ExtraField[];
  extras: Record<string, string>;
  setExtras: React.Dispatch<React.SetStateAction<Record<string, string>>>;
}) {
  return (
    <>
      {fields.map((field) => (
        <div key={field.key} className="space-y-2">
          <Label>{field.label}</Label>
          {field.type === "select" && field.options ? (
            <Select value={extras[field.key] || ""} onValueChange={(v) => setExtras((prev) => ({ ...prev, [field.key]: v }))}>
              <SelectTrigger><SelectValue placeholder={field.placeholder ?? "選択"} /></SelectTrigger>
              <SelectContent>
                {field.nullable && <SelectItem value="__none__">なし</SelectItem>}
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
    </>
  );
}

// ── Unified Item Dialog (always-editable form) ──

export function MasterItemDialog({
  open,
  onOpenChange,
  /** null = create mode, MasterRow = edit existing */
  item,
  items,
  config,
  onSaved,
  onDeleted,
  onRestored,
  canDelete = true,
  detailExtra,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: MasterRow | null;
  items: MasterRow[];
  config: MasterPageConfig;
  onSaved: () => void;
  onDeleted: () => void;
  onRestored: () => void;
  canDelete?: boolean;
  detailExtra?: ReactNode;
}) {
  const isCreate = item === null;
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [parentId, setParentId] = useState("__none__");
  const [extras, setExtras] = useState<Record<string, string>>({});

  const parentKey = config.parentKey ?? "parent_id";
  const allExtraFields = config.dialogExtraFields ?? config.extraFields ?? [];
  const createOnlyFields = config.createOnlyFields ?? [];

  // Pre-fill form on open
  useEffect(() => {
    if (!open) { setError(null); return; }
    if (item) {
      setCode(item.code);
      setName(item.name);
      const pid = item[parentKey] as number | null;
      setParentId(pid ? String(pid) : "__none__");
      const ex: Record<string, string> = {};
      for (const field of allExtraFields) {
        const val = item[field.key];
        if (field.nullable && val == null) { ex[field.key] = "__none__"; }
        else if (field.type === "date" && val) { ex[field.key] = String(val).slice(0, 10); }
        else { ex[field.key] = val ? String(val) : ""; }
      }
      setExtras(ex);
    } else {
      setCode(""); setName(""); setParentId("__none__"); setExtras({});
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleSubmit = async () => {
    setError(null);
    if (!code.trim() || !name.trim()) { setError("コードと名前は必須です"); return; }
    setSaving(true);
    try {
      const payload: Record<string, unknown> = { code: code.trim(), name: name.trim() };
      if (config.parentKey) {
        if (parentId !== "__none__") {
          payload[config.parentKey] = Number(parentId);
        } else if (item) {
          payload[config.parentKey] = null;
        }
      }
      const fieldsToSend = isCreate ? [...createOnlyFields, ...allExtraFields] : allExtraFields;
      for (const field of fieldsToSend) {
        const apiKey = field.apiKey ?? field.key;
        const val = extras[field.key];
        if (field.nullable && val === "__none__") { payload[apiKey] = null; }
        else if (field.type === "date" && val) { payload[apiKey] = new Date(val).toISOString(); }
        else if (field.type === "select" && val && /^\d+$/.test(val)) { payload[apiKey] = Number(val); }
        else if (val) { payload[apiKey] = val; }
      }
      if (item) {
        await api.put(`${config.endpoint}/${item.id}`, payload);
      } else {
        if (config.defaultExtraValues) Object.assign(payload, config.defaultExtraValues);
        await api.post(config.endpoint, payload);
      }
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存に失敗しました");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isCreate ? (config.createLabel ?? `${config.entityName}の新規作成`) : item.name}</DialogTitle>
          {!isCreate && <DialogDescription><span className="font-mono">{item.code}</span></DialogDescription>}
        </DialogHeader>

        <div className="space-y-4">
          {/* Create-only fields (e.g., email) */}
          {isCreate && createOnlyFields.map((field) => (
            <div key={field.key} className="space-y-2">
              <Label>{field.label}</Label>
              <Input value={extras[field.key] || ""} onChange={(e) => setExtras((prev) => ({ ...prev, [field.key]: e.target.value }))} placeholder={field.placeholder} />
            </div>
          ))}

          <div className="space-y-2">
            <Label>コード</Label>
            <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder={config.codePlaceholder ?? "例: code-001"} className="font-mono" />
          </div>
          <div className="space-y-2">
            <Label>名前</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={config.namePlaceholder ?? "例: 名前"} />
          </div>

          {config.extraFieldsFirst && <ExtraFieldsBlock fields={allExtraFields} extras={extras} setExtras={setExtras} />}

          {config.parentKey && (
            <div className="space-y-2">
              <Label>親（任意）</Label>
              <Select value={parentId} onValueChange={setParentId}>
                <SelectTrigger><SelectValue placeholder="なし" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">なし</SelectItem>
                  {items.filter((a) => {
                    if (!a.is_active || a.id === item?.id) return false;
                    if (config.parentFilter && !config.parentFilter(a, extras)) return false;
                    return true;
                  }).map((a) => (
                    <SelectItem key={a.id} value={String(a.id)}>{a.code} {a.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {!config.extraFieldsFirst && <ExtraFieldsBlock fields={allExtraFields} extras={extras} setExtras={setExtras} />}

          {/* Extra detail content (read-only info like email, external_id) */}
          {!isCreate && detailExtra}

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          {!isCreate && item.is_active && canDelete && (
            <Button variant="outline" size="sm" className="text-destructive hover:text-destructive mr-auto" onClick={onDeleted}>
              <Trash2 className="h-3.5 w-3.5 mr-1" />無効化
            </Button>
          )}
          {!isCreate && !item.is_active && (
            <Button variant="outline" size="sm" className="mr-auto" onClick={onRestored}>
              <Undo2 className="h-3.5 w-3.5 mr-1 text-green-400" />復元
            </Button>
          )}
          {isCreate && <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>キャンセル</Button>}
          <Button onClick={handleSubmit} disabled={saving}>{saving ? "保存中..." : isCreate ? "作成" : "更新"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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

// ── Full MasterPage ──

export function MasterPage({ config, headerSlot, afterContent, canDelete, detailExtra }: {
  config: MasterPageConfig;
  headerSlot?: ReactNode;
  afterContent?: ReactNode;
  canDelete?: (item: MasterRow) => boolean;
  /** Extra content rendered in the detail dialog */
  detailExtra?: (item: MasterRow) => ReactNode;
}) {
  const [items, setItems] = useState<MasterRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogItem, setDialogItem] = useState<MasterRow | null>(null);
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());
  const [showInactive, setShowInactive] = useState(false);

  const parentKey = config.parentKey ?? "parent_id";

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = { ...config.fetchParams };
      if (showInactive) params.include_inactive = "true";
      let data = await fetchAllPages<MasterRow>(config.endpoint, Object.keys(params).length > 0 ? params : undefined);
      if (config.clientFilter) data = data.filter(config.clientFilter);
      setItems(data);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.body.error : `${config.entityName}の取得に失敗しました`);
    } finally {
      setLoading(false);
    }
  }, [config.endpoint, config.entityName, config.fetchParams, showInactive]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  const toggleCollapse = (id: number) => {
    setCollapsed((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  };

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

  const handleCreate = () => { setDialogItem(null); setDialogOpen(true); };
  const handleRowClick = (id: number) => {
    const found = items.find((a) => a.id === id) ?? null;
    setDialogItem(found);
    setDialogOpen(true);
  };
  const handleDelete = async (id: number) => {
    if (!confirm(`この${config.entityName}を無効化しますか？`)) return;
    try {
      await api.delete(`${config.endpoint}/${id}`);
      toast.success(`${config.entityName}を無効化しました`);
      setDialogOpen(false);
      fetchItems();
    } catch (e) { toast.error(e instanceof ApiError ? e.body.error : "無効化に失敗しました"); }
  };
  const handleRestore = async (id: number) => {
    try {
      await api.post(`${config.endpoint}/${id}/restore`, {});
      toast.success(`${config.entityName}を復元しました`);
      setDialogOpen(false);
      fetchItems();
    } catch (e) { toast.error(e instanceof ApiError ? e.body.error : "復元に失敗しました"); }
  };
  const handleSaved = () => {
    toast.success(dialogItem ? `${config.entityName}を更新しました` : `${config.entityName}を作成しました`);
    setDialogOpen(false);
    fetchItems();
  };

  return (
    <div className="p-4 md:p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          {config.icon && <span className="text-muted-foreground">{config.icon}</span>}
          <h2 className="text-xl font-semibold">{config.title}</h2>
          {headerSlot}
        </div>
        <div className="flex gap-2">
          <Button variant={showInactive ? "secondary" : "outline"} size="sm" onClick={() => setShowInactive((v) => !v)}>
            {showInactive ? <EyeOff className="h-4 w-4 mr-1" /> : <Eye className="h-4 w-4 mr-1" />}
            削除済み
          </Button>
          <Button variant="outline" size="sm" onClick={fetchItems}><RefreshCw className="h-4 w-4" /></Button>
          <Button size="sm" onClick={handleCreate}><Plus className="h-4 w-4 mr-1" />{config.createLabel ?? "新規作成"}</Button>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12 text-muted-foreground">読み込み中...</div>
      ) : items.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">{config.entityName}がありません</div>
      ) : (
        <div className="space-y-6">
          {sections.map(({ title, roots }) => {
            if (roots.length === 0) return null;
            const flat = flattenTree(roots, collapsed);
            return (
              <MasterTreeSection
                key={title ?? "_all"}
                title={title}
                nodes={flat}
                collapsed={collapsed}
                onToggleCollapse={toggleCollapse}
                onSelect={handleRowClick}
                extraFields={config.extraFields}
              />
            );
          })}
        </div>
      )}

      {afterContent}

      <Button className="fixed bottom-6 right-6 h-14 w-14 rounded-full shadow-lg" size="icon" onClick={handleCreate}>
        <Plus className="h-6 w-6" />
      </Button>

      <MasterItemDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        item={dialogItem}
        items={items}
        config={config}
        onSaved={handleSaved}
        onDeleted={() => dialogItem && handleDelete(dialogItem.id)}
        onRestored={() => dialogItem && handleRestore(dialogItem.id)}
        canDelete={dialogItem && canDelete ? canDelete(dialogItem) : true}
        detailExtra={dialogItem && detailExtra ? detailExtra(dialogItem) : undefined}
      />
    </div>
  );
}
