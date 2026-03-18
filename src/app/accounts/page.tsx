"use client";

import { useMemo, useState, useEffect, useCallback } from "react";
import { MasterPage, type ExtraField } from "@/components/shared/master-page";
import { BookSelector } from "@/components/shared/book-selector";
import { useBooks } from "@/hooks/use-books";
import { api, fetchAllPages } from "@/lib/api-client";
import { getRoleColor } from "@/lib/role-utils";

interface DisplayAccountRow {
  id: number;
  code: string;
  name: string;
  account_type: string;
  parent_id: number | null;
  color_hex?: string | null;
}

interface RoleRow {
  id: number;
  code: string;
  name: string;
  color_hex?: string | null;
}

const TYPE_KEYS = ["asset", "liability", "equity", "revenue", "expense"] as const;

const DEFAULT_TYPE_LABELS: Record<string, string> = {
  asset: "資産の部",
  liability: "負債の部",
  equity: "純資産の部",
  revenue: "収益の部",
  expense: "費用の部",
};

type TabKey = "accounts" | "display-accounts";

export default function AccountsPage() {
  const { books, selectedBookId, setSelectedBookId, selectedBook } = useBooks();
  const [tab, setTab] = useState<TabKey>("accounts");
  const [displayAccounts, setDisplayAccounts] = useState<DisplayAccountRow[]>([]);
  const [roles, setRoles] = useState<RoleRow[]>([]);

  const fetchRoles = useCallback(async () => {
    try {
      const res = await api.get<{ data: RoleRow[] }>("/roles");
      setRoles(res.data);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { fetchRoles(); }, [fetchRoles]);

  useEffect(() => {
    if (!selectedBookId) return;
    fetchAllPages<DisplayAccountRow>(`/books/${selectedBookId}/display-accounts`)
      .then(setDisplayAccounts)
      .catch(() => setDisplayAccounts([]));
  }, [selectedBookId]);

  const typeLabels = selectedBook?.type_labels ?? {};

  const typeOptions = useMemo(
    () => TYPE_KEYS.map((key) => ({
      value: key,
      label: typeLabels[key] || DEFAULT_TYPE_LABELS[key].replace("の部", ""),
    })),
    [typeLabels],
  );

  const sections = useMemo(
    () => TYPE_KEYS.map((key) => [
      key,
      typeLabels[key] || DEFAULT_TYPE_LABELS[key],
    ] as [string, string]),
    [typeLabels],
  );

  // ── 勘定科目タブ用 ──

  const leafDisplayAccounts = useMemo(() => {
    const parentIds = new Set(
      displayAccounts.map((da) => String(da.parent_id)).filter((v) => v !== "null"),
    );
    return displayAccounts.filter((da) => !parentIds.has(String(da.id)));
  }, [displayAccounts]);

  const displayAccountOptions = useMemo(
    () => leafDisplayAccounts.map((da) => ({
      value: String(da.id),
      label: `${da.code} ${da.name}`,
    })),
    [leafDisplayAccounts],
  );

  const displayAccountMap = useMemo(
    () => new Map(displayAccounts.map((da) => [String(da.id), da])),
    [displayAccounts],
  );

  const accountExtraFields = useMemo<ExtraField[]>(
    () => [{
      key: "display_account_id",
      label: "表示科目",
      type: "select" as const,
      options: displayAccountOptions,
      nullable: true,
      format: (v) => {
        if (v == null) return "";
        const da = displayAccountMap.get(String(v));
        return da ? da.name : "";
      },
      badge: true,
      badgeColor: (v) => {
        if (v == null) return undefined;
        const da = displayAccountMap.get(String(v));
        return da?.color_hex ?? undefined;
      },
    }],
    [displayAccountOptions, displayAccountMap],
  );

  const accountDialogExtraFields = useMemo<ExtraField[]>(
    () => [
      {
        key: "account_type",
        label: "分類",
        type: "select" as const,
        options: typeOptions,
        format: (v) => typeOptions.find((t) => t.value === v)?.label ?? String(v),
      },
      {
        key: "display_account_id",
        label: "表示科目",
        type: "select" as const,
        options: displayAccountOptions,
        nullable: true,
        format: (v) => {
          if (v == null) return "なし";
          const da = displayAccountMap.get(String(v));
          return da ? `${da.code} ${da.name}` : "なし";
        },
        optionFilter: (optionValue, extras) => {
          const selectedType = extras.account_type;
          if (!selectedType) return true;
          const da = displayAccountMap.get(optionValue);
          return da ? da.account_type === selectedType : true;
        },
      },
    ],
    [typeOptions, displayAccountOptions, displayAccountMap],
  );

  const accountConfig = useMemo(
    () => ({
      title: "科目",
      endpoint: `/books/${selectedBookId}/accounts`,
      parentKey: "parent_account_id" as const,
      entityName: "勘定科目",
      codePlaceholder: "例: 1000",
      namePlaceholder: "例: 現金",
      groupBy: { field: "account_type", sections },
      extraFields: accountExtraFields,
      dialogExtraFields: accountDialogExtraFields,
      hasColor: true,
      entityType: "account",
    }),
    [selectedBookId, sections, accountExtraFields, accountDialogExtraFields],
  );

  // ── 表示科目タブ用 ──

  // Map authority_level codes → role display name and color
  const authorityLabelMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of roles) {
      m.set(r.code, r.name);
    }
    // "tenant" authority uses the admin role display or fallback
    if (!m.has("tenant")) m.set("tenant", "テナント");
    return m;
  }, [roles]);

  const authorityColorMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of roles) {
      m.set(r.code, r.color_hex ?? getRoleColor(r.code));
    }
    if (!m.has("tenant")) m.set("tenant", getRoleColor("platform"));
    return m;
  }, [roles]);

  const daExtraFields = useMemo<ExtraField[]>(
    () => [{
      key: "authority_level",
      label: "権限",
      type: "select" as const,
      options: ["tenant", "admin", "user"].map((code) => ({
        value: code,
        label: authorityLabelMap.get(code) ?? code,
      })),
      format: (v) => authorityLabelMap.get(String(v)) ?? String(v),
      badgeColor: (v) => authorityColorMap.get(String(v)),
    }],
    [authorityLabelMap, authorityColorMap],
  );

  const daDialogExtraFields = useMemo<ExtraField[]>(
    () => [
      {
        key: "account_type",
        label: "分類",
        type: "select" as const,
        options: typeOptions,
        format: (v) => typeOptions.find((t) => t.value === v)?.label ?? String(v),
      },
      {
        key: "sort_order",
        label: "表示順",
        type: "number" as const,
        placeholder: "0",
      },
    ],
    [typeOptions],
  );

  const daConfig = useMemo(
    () => ({
      title: "科目",
      endpoint: `/books/${selectedBookId}/display-accounts`,
      parentKey: "parent_id" as const,
      entityName: "表示科目",
      codePlaceholder: "例: DA-5010",
      namePlaceholder: "例: 食費",
      groupBy: { field: "account_type", sections },
      extraFields: daExtraFields,
      dialogExtraFields: daDialogExtraFields,
      extraFieldsFirst: true,
      parentFilter: (candidate: { [key: string]: unknown }, extras: Record<string, string>) => {
        const selectedType = extras.account_type;
        if (!selectedType) return true;
        return candidate.account_type === selectedType;
      },
      hasColor: true,
      entityType: "display_account",
    }),
    [selectedBookId, sections, daExtraFields, daDialogExtraFields],
  );

  if (!selectedBookId) {
    return <div className="p-6 text-center text-muted-foreground">帳簿を読み込み中...</div>;
  }

  const config = tab === "accounts" ? accountConfig : daConfig;

  const headerSlot = (
    <div className="flex items-center gap-3">
      <BookSelector
        books={books}
        selectedBookId={selectedBookId}
        onValueChange={setSelectedBookId}
      />
      <div className="flex rounded-md border border-border bg-muted/50 p-0.5">
        <button
          onClick={() => setTab("accounts")}
          className={`px-3 py-1 text-xs font-medium rounded-sm transition-colors ${
            tab === "accounts"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          勘定科目
        </button>
        <button
          onClick={() => setTab("display-accounts")}
          className={`px-3 py-1 text-xs font-medium rounded-sm transition-colors ${
            tab === "display-accounts"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          表示科目
        </button>
      </div>
    </div>
  );

  return (
    <MasterPage
      key={`${selectedBookId}-${tab}`}
      config={config}
      headerSlot={headerSlot}
    />
  );
}
