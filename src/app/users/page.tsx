"use client";

import { useState, useEffect, useCallback } from "react";
import { RefreshCw, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { api, ApiError } from "@/lib/api-client";

interface UserRow {
  id: number;
  code: string;
  name: string;
  external_id: string;
  role_id: number;
  revision: number;
  created_at: string;
}

interface RoleRow {
  id: number;
  code: string;
  name: string;
}

const ROLE_COLOR: Record<string, string> = {
  platform: "bg-purple-900/30 text-purple-400 border-purple-800/50",
  audit: "bg-amber-900/30 text-amber-400 border-amber-800/50",
  admin: "bg-blue-900/30 text-blue-400 border-blue-800/50",
  user: "bg-green-900/30 text-green-400 border-green-800/50",
};

export default function UsersPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<number | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [usersRes, rolesRes] = await Promise.all([
        api.get<{ data: UserRow[] }>("/users"),
        api.get<{ data: RoleRow[] }>("/roles"),
      ]);
      setUsers(usersRes.data);
      setRoles(rolesRes.data);
    } catch (e) {
      const msg = e instanceof ApiError ? e.body.error : "データの取得に失敗しました";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleRoleChange = async (userId: number, roleId: string) => {
    setUpdatingId(userId);
    try {
      await api.put(`/users/${userId}`, { role_id: Number(roleId) });
      toast.success("ロールを更新しました");
      fetchData();
    } catch (e) {
      const msg = e instanceof ApiError ? e.body.error : "ロールの更新に失敗しました";
      toast.error(msg);
    } finally {
      setUpdatingId(null);
    }
  };

  const getRoleCode = (roleId: number) => {
    return roles.find((r) => r.id === roleId)?.code ?? "";
  };

  const getRoleName = (roleId: number) => {
    return roles.find((r) => r.id === roleId)?.name ?? String(roleId);
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between p-4 md:p-6 border-b border-border/30">
        <div className="flex items-center gap-2">
          <ShieldAlert className="size-5 text-muted-foreground" />
          <h2 className="text-xl font-semibold">ユーザー管理</h2>
        </div>
        <Button variant="outline" size="sm" onClick={fetchData}>
          <RefreshCw className="size-4 mr-1" />
          更新
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 md:p-6">
        <p className="text-sm text-muted-foreground mb-4">
          adminロール以上のユーザーのみ、他ユーザーのロールを変更できます。
        </p>

        {loading ? (
          <div className="text-center py-12 text-muted-foreground">
            読み込み中...
          </div>
        ) : users.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            ユーザーがいません
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="py-2 px-3 font-medium">ID</th>
                  <th className="py-2 px-3 font-medium">コード</th>
                  <th className="py-2 px-3 font-medium">名前</th>
                  <th className="py-2 px-3 font-medium">External ID</th>
                  <th className="py-2 px-3 font-medium">ロール</th>
                  <th className="py-2 px-3 font-medium">リビジョン</th>
                  <th className="py-2 px-3 font-medium">作成日</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => {
                  const roleCode = getRoleCode(u.role_id);
                  return (
                    <tr
                      key={u.id}
                      className="border-b border-border/50 hover:bg-accent/20 transition-colors"
                    >
                      <td className="py-2 px-3 font-mono text-xs">{u.id}</td>
                      <td className="py-2 px-3 font-mono text-xs">{u.code}</td>
                      <td className="py-2 px-3">{u.name}</td>
                      <td className="py-2 px-3 font-mono text-xs max-w-48 truncate">
                        {u.external_id}
                      </td>
                      <td className="py-2 px-3">
                        <div className="flex items-center gap-2">
                          <Badge className={ROLE_COLOR[roleCode] || ""}>
                            {getRoleName(u.role_id)}
                          </Badge>
                          <Select
                            value={String(u.role_id)}
                            onValueChange={(v) => handleRoleChange(u.id, v)}
                            disabled={updatingId === u.id}
                          >
                            <SelectTrigger className="h-7 w-32 text-xs">
                              <SelectValue placeholder="変更" />
                            </SelectTrigger>
                            <SelectContent>
                              {roles.map((r) => (
                                <SelectItem key={r.id} value={String(r.id)}>
                                  {r.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </td>
                      <td className="py-2 px-3 text-xs text-muted-foreground">
                        {u.revision}
                      </td>
                      <td className="py-2 px-3 text-xs text-muted-foreground">
                        {new Date(u.created_at).toLocaleDateString("ja-JP")}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
