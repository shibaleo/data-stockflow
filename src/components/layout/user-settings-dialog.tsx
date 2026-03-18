"use client";

import { useState, useEffect, useCallback } from "react";
import { Key, Plus, Trash2, Copy, Check } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { api, ApiError } from "@/lib/api-client";
import { useMe } from "@/components/auth/auth-gate";
import { ColorBadge } from "@/components/shared/color-badge";
import { getRoleLabel, getRoleColor } from "@/lib/role-utils";

// ── Types ──

interface ApiKeyRow {
  uuid: string;
  name: string;
  key_prefix: string;
  role: string;
  expires_at: string | null;
  last_used_at: string | null;
  created_at: string;
}

const EXPIRY_OPTIONS = [
  { label: "30日", value: "30" },
  { label: "90日", value: "90" },
  { label: "180日", value: "180" },
  { label: "365日", value: "365" },
  { label: "無期限", value: "0" },
];

// ── Component ──

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function UserSettingsDialog({ open, onOpenChange }: Props) {
  const { me, refresh } = useMe();

  // Name editing
  const [name, setName] = useState(me.name);
  const [nameSaving, setNameSaving] = useState(false);

  // Password
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [passwordSaving, setPasswordSaving] = useState(false);

  // API Keys
  const [apiKeys, setApiKeys] = useState<ApiKeyRow[]>([]);
  const [keysLoading, setKeysLoading] = useState(true);
  const [showNewKey, setShowNewKey] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [newKeyExpiry, setNewKeyExpiry] = useState("90");
  const [keyCreating, setKeyCreating] = useState(false);
  const [generatedKey, setGeneratedKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [deletingKeyId, setDeletingKeyId] = useState<string | null>(null);

  // Sync name when dialog opens
  useEffect(() => {
    if (open) {
      setName(me.name);
      setPassword("");
      setPasswordConfirm("");
    }
  }, [open, me.name]);

  // Fetch API keys
  const fetchApiKeys = useCallback(async () => {
    setKeysLoading(true);
    try {
      const res = await api.get<{ data: ApiKeyRow[] }>("/users/me/api-keys");
      setApiKeys(res.data);
    } catch { /* ignore */ }
    finally { setKeysLoading(false); }
  }, []);

  useEffect(() => {
    if (open) fetchApiKeys();
  }, [open, fetchApiKeys]);

  // ── Handlers ──

  const handleSaveName = async () => {
    if (!name.trim() || name === me.name) return;
    setNameSaving(true);
    try {
      await api.put(`/users/${me.id}`, { name: name.trim() });
      await refresh();
      toast.success("表示名を変更しました");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.body.error : "変更に失敗しました");
    } finally { setNameSaving(false); }
  };

  const handleChangePassword = async () => {
    if (password.length < 4) {
      toast.error("パスワードは4文字以上にしてください");
      return;
    }
    if (password !== passwordConfirm) {
      toast.error("パスワードが一致しません");
      return;
    }
    setPasswordSaving(true);
    try {
      await api.post("/users/me/password", { password });
      setPassword("");
      setPasswordConfirm("");
      toast.success("パスワードを変更しました");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.body.error : "変更に失敗しました");
    } finally { setPasswordSaving(false); }
  };

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
      toast.error(e instanceof ApiError ? e.body.error : "作成に失敗しました");
    } finally { setKeyCreating(false); }
  };

  const handleDeleteKey = async (uuid: string) => {
    setDeletingKeyId(uuid);
    try {
      await api.delete(`/users/me/api-keys/${uuid}`);
      toast.success("API Keyを削除しました");
      fetchApiKeys();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.body.error : "削除に失敗しました");
    } finally { setDeletingKeyId(null); }
  };

  const handleCopy = async () => {
    if (!generatedKey) return;
    await navigator.clipboard.writeText(generatedKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const closeNewKey = () => {
    setShowNewKey(false);
    setGeneratedKey(null);
    setNewKeyName("");
    setNewKeyExpiry("90");
    setCopied(false);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>ユーザー設定</DialogTitle>
          </DialogHeader>

          <div className="space-y-6">
            {/* ── Profile ── */}
            <section className="space-y-3">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">プロフィール</h3>
              <div className="space-y-1">
                <Label>コード</Label>
                <p className="text-sm text-muted-foreground">{me.code}</p>
              </div>
              <div className="space-y-1">
                <Label>メールアドレス</Label>
                <p className="text-sm text-muted-foreground">{me.email}</p>
              </div>
              <div className="space-y-1">
                <Label>ロール</Label>
                <p className="text-sm">
                  <ColorBadge color={me.role_color ?? getRoleColor(me.role)}>
                    {me.role_name ?? getRoleLabel(me.role)}
                  </ColorBadge>
                </p>
              </div>
            </section>

            {/* ── Display Name ── */}
            <section className="space-y-3">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">表示名</h3>
              <div className="flex gap-2">
                <Input
                  id="settings-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
                <Button
                  size="sm"
                  onClick={handleSaveName}
                  disabled={nameSaving || !name.trim() || name === me.name}
                >
                  {nameSaving ? "保存中..." : "保存"}
                </Button>
              </div>
            </section>

            {/* ── Password ── */}
            <section className="space-y-3">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">パスワード変更</h3>
              <div className="space-y-2">
                <Label htmlFor="settings-pw">新しいパスワード</Label>
                <Input
                  id="settings-pw"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="settings-pw-confirm">確認</Label>
                <Input
                  id="settings-pw-confirm"
                  type="password"
                  value={passwordConfirm}
                  onChange={(e) => setPasswordConfirm(e.target.value)}
                  autoComplete="new-password"
                />
              </div>
              <Button
                size="sm"
                onClick={handleChangePassword}
                disabled={passwordSaving || password.length < 4}
              >
                {passwordSaving ? "変更中..." : "パスワードを変更"}
              </Button>
            </section>

            {/* ── API Keys ── */}
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <Key className="size-3.5" /> API Keys
                </h3>
                <Button variant="outline" size="sm" onClick={() => setShowNewKey(true)}>
                  <Plus className="size-3.5 mr-1" />新規作成
                </Button>
              </div>

              {keysLoading ? (
                <p className="text-sm text-muted-foreground py-4 text-center">読み込み中...</p>
              ) : apiKeys.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">API Keyがありません</p>
              ) : (
                <div className="space-y-2">
                  {apiKeys.map((k) => (
                    <div key={k.uuid} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                      <div className="min-w-0">
                        <p className="font-medium truncate">{k.name}</p>
                        <p className="text-xs text-muted-foreground">
                          <span className="font-mono">{k.key_prefix}...</span>
                          {" · "}
                          {k.expires_at ? new Date(k.expires_at).toLocaleDateString("ja-JP") : "無期限"}
                        </p>
                      </div>
                      <Button
                        variant="ghost" size="sm"
                        className="shrink-0 h-7 text-destructive hover:text-destructive"
                        onClick={() => handleDeleteKey(k.uuid)}
                        disabled={deletingKeyId === k.uuid}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── New API Key sub-dialog ── */}
      <Dialog open={showNewKey} onOpenChange={(o) => { if (!o) closeNewKey(); }}>
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
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <Label>名前</Label>
                <Input
                  placeholder="例: CI/CD, ローカル開発"
                  value={newKeyName}
                  onChange={(e) => setNewKeyName(e.target.value)}
                  autoFocus
                />
              </div>
              <div>
                <Label>有効期限</Label>
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
              <Button onClick={closeNewKey}>閉じる</Button>
            ) : (
              <>
                <Button variant="outline" onClick={closeNewKey}>キャンセル</Button>
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
