"use client";

import { useState, useEffect, useCallback } from "react";
import { ShieldAlert, Key, Plus, Trash2, Copy, Check } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { api, ApiError } from "@/lib/api-client";
import { MasterPage, PropRow } from "@/components/shared/master-page";

// ── Types ──

interface RoleRow {
  id: number;
  code: string;
  name: string;
}

interface ApiKeyRow {
  uuid: string;
  name: string;
  key_prefix: string;
  role: string;
  expires_at: string | null;
  last_used_at: string | null;
  created_at: string;
}

const ROLE_COLOR: Record<string, string> = {
  platform: "bg-purple-900/30 text-purple-400 border-purple-800/50",
  audit: "bg-amber-900/30 text-amber-400 border-amber-800/50",
  admin: "bg-blue-900/30 text-blue-400 border-blue-800/50",
  user: "bg-green-900/30 text-green-400 border-green-800/50",
};

const EXPIRY_OPTIONS = [
  { label: "30日", value: "30" },
  { label: "90日", value: "90" },
  { label: "180日", value: "180" },
  { label: "365日", value: "365" },
  { label: "無期限", value: "0" },
];

export default function UsersPage() {
  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [meId, setMeId] = useState<number | null>(null);

  // API Key state
  const [apiKeys, setApiKeys] = useState<ApiKeyRow[]>([]);
  const [keysLoading, setKeysLoading] = useState(true);
  const [showKeyDialog, setShowKeyDialog] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [newKeyExpiry, setNewKeyExpiry] = useState("90");
  const [keyCreating, setKeyCreating] = useState(false);
  const [generatedKey, setGeneratedKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [deletingKeyId, setDeletingKeyId] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      api.get<{ data: RoleRow[] }>("/roles"),
      api.get<{ data: { id: number } }>("/users/me"),
    ]).then(([rolesRes, meRes]) => {
      setRoles(rolesRes.data);
      setMeId(meRes.data.id);
    });
  }, []);

  const fetchApiKeys = useCallback(async () => {
    setKeysLoading(true);
    try {
      const res = await api.get<{ data: ApiKeyRow[] }>("/users/me/api-keys");
      setApiKeys(res.data);
    } catch { /* silently fail */ }
    finally { setKeysLoading(false); }
  }, []);

  useEffect(() => { fetchApiKeys(); }, [fetchApiKeys]);

  // ── Role helpers ──

  const getRoleCode = (roleId: unknown) => roles.find((r) => r.id === Number(roleId))?.code ?? "";
  const getRoleName = (roleId: unknown) => roles.find((r) => r.id === Number(roleId))?.name ?? String(roleId);

  // ── API Key handlers ──

  const handleCreateKey = async () => {
    if (!newKeyName.trim()) return;
    setKeyCreating(true);
    try {
      const expiryDays = Number(newKeyExpiry);
      const res = await api.post<{ data: ApiKeyRow & { raw_key: string } }>(
        "/users/me/api-keys",
        { name: newKeyName.trim(), ...(expiryDays > 0 ? { expires_in_days: expiryDays } : {}) },
      );
      setGeneratedKey(res.data.raw_key);
      fetchApiKeys();
      toast.success("API Keyを作成しました");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.body.error : "API Keyの作成に失敗しました");
    } finally { setKeyCreating(false); }
  };

  const handleDeleteKey = async (uuid: string) => {
    setDeletingKeyId(uuid);
    try {
      await api.delete(`/users/me/api-keys/${uuid}`);
      toast.success("API Keyを削除しました");
      fetchApiKeys();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.body.error : "API Keyの削除に失敗しました");
    } finally { setDeletingKeyId(null); }
  };

  const handleCopy = async () => {
    if (!generatedKey) return;
    await navigator.clipboard.writeText(generatedKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const closeKeyDialog = () => {
    setShowKeyDialog(false);
    setGeneratedKey(null);
    setNewKeyName("");
    setNewKeyExpiry("90");
    setCopied(false);
  };

  return (
    <>
      <MasterPage
        config={{
          title: "ユーザー管理",
          icon: <ShieldAlert className="size-5" />,
          endpoint: "/users",
          entityName: "ユーザー",
          createLabel: "ユーザー招待",
          codePlaceholder: "例: user001",
          namePlaceholder: "例: 山田太郎",
          createOnlyFields: [
            { key: "email", label: "メールアドレス", type: "text", placeholder: "user@example.com" },
          ],
          dialogExtraFields: [
            {
              key: "role_id", label: "ロール", type: "select", apiKey: "role_id",
              options: roles.filter((r) => !["platform", "audit"].includes(r.code))
                .map((r) => ({ value: String(r.id), label: r.name })),
            },
          ],
          extraFields: [
            {
              key: "role_id", label: "ロール", type: "text",
              format: (v) => getRoleName(v),
            },
          ],
        }}
        canDelete={(item) => item.id !== meId}
        detailExtra={(item) => {
          const roleCode = getRoleCode(item.role_id);
          return (
            <>
              <PropRow label="メール" value={String(item.email ?? "")} />
              <PropRow label="ロール">
                <Badge className={ROLE_COLOR[roleCode] || ""}>{getRoleName(item.role_id)}</Badge>
              </PropRow>
              <PropRow label="外部ID" value={String(item.external_id ?? "未連携")} />
              {item.id === meId && (
                <PropRow label="">
                  <Badge variant="outline" className="text-xs">自分</Badge>
                </PropRow>
              )}
            </>
          );
        }}
        afterContent={
          <section className="mt-8">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Key className="size-5 text-muted-foreground" />
                <h3 className="text-lg font-semibold">API Keys</h3>
              </div>
              <Button variant="outline" size="sm" onClick={() => setShowKeyDialog(true)}>
                <Plus className="size-4 mr-1" />
                新規作成
              </Button>
            </div>

            <p className="text-sm text-muted-foreground mb-4">
              API Keyを使用すると、Bearer認証でAPIに直接アクセスできます。キーは作成時に一度だけ表示されます。
            </p>

            {keysLoading ? (
              <div className="text-center py-8 text-muted-foreground">読み込み中...</div>
            ) : apiKeys.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">API Keyがありません</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-muted-foreground">
                      <th className="py-2 px-3 font-medium">名前</th>
                      <th className="py-2 px-3 font-medium">プレフィックス</th>
                      <th className="py-2 px-3 font-medium">ロール</th>
                      <th className="py-2 px-3 font-medium">有効期限</th>
                      <th className="py-2 px-3 font-medium">最終使用</th>
                      <th className="py-2 px-3 font-medium">作成日</th>
                      <th className="py-2 px-3 font-medium"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {apiKeys.map((k) => (
                      <tr key={k.uuid} className="border-b border-border/50 hover:bg-accent/20 transition-colors">
                        <td className="py-2 px-3 font-medium">{k.name}</td>
                        <td className="py-2 px-3 font-mono text-xs">{k.key_prefix}...</td>
                        <td className="py-2 px-3">
                          <Badge className={ROLE_COLOR[k.role] || ""}>{k.role}</Badge>
                        </td>
                        <td className="py-2 px-3 text-xs text-muted-foreground">
                          {k.expires_at ? new Date(k.expires_at).toLocaleDateString("ja-JP") : "無期限"}
                        </td>
                        <td className="py-2 px-3 text-xs text-muted-foreground">
                          {k.last_used_at ? new Date(k.last_used_at).toLocaleDateString("ja-JP") : "未使用"}
                        </td>
                        <td className="py-2 px-3 text-xs text-muted-foreground">
                          {new Date(k.created_at).toLocaleDateString("ja-JP")}
                        </td>
                        <td className="py-2 px-3">
                          <Button
                            variant="ghost" size="sm"
                            className="h-7 text-destructive hover:text-destructive"
                            onClick={() => handleDeleteKey(k.uuid)}
                            disabled={deletingKeyId === k.uuid}
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        }
      />

      {/* Create API Key dialog */}
      <Dialog open={showKeyDialog} onOpenChange={(open) => { if (!open) closeKeyDialog(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{generatedKey ? "API Key が生成されました" : "API Key を作成"}</DialogTitle>
          </DialogHeader>
          {generatedKey ? (
            <div className="space-y-4">
              <p className="text-sm text-amber-400">
                このキーは一度だけ表示されます。安全な場所に保存してください。
              </p>
              <div className="flex items-center gap-2">
                <code className="flex-1 bg-muted p-3 rounded text-xs font-mono break-all select-all">
                  {generatedKey}
                </code>
                <Button variant="outline" size="sm" onClick={handleCopy}>
                  {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                使用例: <code className="bg-muted px-1 rounded">Authorization: Bearer {generatedKey.slice(0, 16)}...</code>
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium mb-1 block">名前</label>
                <Input
                  placeholder="例: CI/CD, ローカル開発"
                  value={newKeyName}
                  onChange={(e) => setNewKeyName(e.target.value)}
                  autoFocus
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">有効期限</label>
                <Select value={newKeyExpiry} onValueChange={setNewKeyExpiry}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {EXPIRY_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          <DialogFooter>
            {generatedKey ? (
              <Button onClick={closeKeyDialog}>閉じる</Button>
            ) : (
              <>
                <Button variant="outline" onClick={closeKeyDialog}>キャンセル</Button>
                <Button onClick={handleCreateKey} disabled={keyCreating || !newKeyName.trim()}>
                  {keyCreating ? "作成中..." : "作成"}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
