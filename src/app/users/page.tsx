"use client";

import { useState, useEffect, useCallback } from "react";
import { ShieldAlert, Shield } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api-client";
import { MasterPage, PropRow } from "@/components/shared/master-page";
import { getRoleColor } from "@/lib/role-utils";
import { useMe } from "@/components/auth/auth-gate";

// ── Types ──

interface RoleRow {
  id: number;
  code: string;
  name: string;
  color_hex?: string | null;
}

const ALLOWED_ROLES = ["admin", "auditor"];

export default function UsersPage() {
  const { me } = useMe();

  if (!ALLOWED_ROLES.includes(me.role)) {
    return <div className="p-6 text-center text-muted-foreground">このページへのアクセス権限がありません</div>;
  }
  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [meId, setMeId] = useState<number | null>(null);
  const [roleColorMap, setRoleColorMap] = useState<Map<string, string>>(new Map());

  const fetchRoles = useCallback(async () => {
    try {
      const res = await api.get<{ data: RoleRow[] }>("/roles");
      setRoles(res.data);
      const m = new Map<string, string>();
      for (const r of res.data) {
        m.set(String(r.id), r.color_hex ?? getRoleColor(r.code));
      }
      setRoleColorMap(m);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    fetchRoles();
    api.get<{ data: { id: number } }>("/users/me").then((res) => setMeId(res.data.id)).catch(() => {});
  }, [fetchRoles]);

  return (
    <div className="space-y-8">
      <MasterPage
        config={{
          title: "ユーザー管理",
          icon: <ShieldAlert className="size-5" />,
          endpoint: "/users",
          entityName: "ユーザー",
          createLabel: "ユーザー招待",
          codePlaceholder: "例: user001",
          namePlaceholder: "例: 山田太郎",
          nameReadOnly: true,
          createOnlyFields: [
            { key: "email", label: "メールアドレス", type: "text", placeholder: "user@example.com" },
          ],
          dialogExtraFields: [
            {
              key: "role_id", label: "ロール", type: "select", apiKey: "role_id",
              options: roles.filter((r) => r.code !== "platform")
                .map((r) => ({ value: String(r.id), label: r.name })),
            },
          ],
          extraFields: [
            { key: "email", label: "メール", type: "text", badge: false },
            {
              key: "role_id", label: "ロール", type: "text",
              format: (v) => roles.find((r) => String(r.id) === String(v))?.name ?? String(v),
              badgeColor: (v) => roleColorMap.get(String(v)),
            },
          ],
        }}
        canDelete={(item) => item.id !== meId}
        detailExtra={(item) => (
          <>
            <PropRow label="メール" value={String(item.email ?? "")} />
            {item.id === meId && (
              <PropRow label="">
                <Badge variant="outline" className="text-xs">自分</Badge>
              </PropRow>
            )}
          </>
        )}
      />

      <MasterPage
        config={{
          title: "ロール一覧",
          icon: <Shield className="size-5" />,
          endpoint: "/roles",
          entityName: "ロール",
          hasColor: true,
          entityType: "role",
          codeReadOnly: true,
          hideCreate: true,
          hideDelete: true,
          sortByKey: true,
        }}
        onColorSaved={fetchRoles}
      />
    </div>
  );
}
