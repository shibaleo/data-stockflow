"use client";

import { useState, useEffect, useMemo, useCallback, type Dispatch, type SetStateAction } from "react";
import { api, fetchAllPages } from "@/lib/api-client";
import type { ComboOption } from "@/components/journals/master-combobox";

/** Base shape shared by all master entities */
export interface EntityRow {
  id: number;
  code: string;
  name: string;
  is_active: boolean;
  color_hex?: string | null;
}

/** Generate a random 6-char alphanumeric code */
export function randomCode(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < 6; i++) result += chars[Math.floor(Math.random() * chars.length)];
  return result;
}

interface UseEntityManagerOptions {
  /** API endpoint, e.g. "/departments". Pass null to skip fetch. */
  endpoint: string | null;
  /** Extra fields merged into the POST body on create (e.g. { tag_type: "general" }) */
  extraCreateFields?: Record<string, unknown>;
  /** Whether to include code in the combo label. Default: true → "code name" */
  showCode?: boolean;
}

interface UseEntityManagerReturn<T extends EntityRow> {
  items: T[];
  setItems: Dispatch<SetStateAction<T[]>>;
  comboOptions: ComboOption[];
  create: (name: string) => Promise<string | null>;
  rename: (id: string, newName: string) => Promise<boolean>;
  refetch: () => Promise<void>;
}

/**
 * Generic hook for managing a master entity list with inline create/rename.
 * Works with any entity that follows the { id, code, name, is_active } pattern.
 * color_hex is automatically picked up from the API response if present.
 */
export function useEntityManager<T extends EntityRow>(
  opts: UseEntityManagerOptions,
): UseEntityManagerReturn<T> {
  const { endpoint, extraCreateFields, showCode = true } = opts;
  const [items, setItems] = useState<T[]>([]);

  const refetch = useCallback(async () => {
    if (!endpoint) return;
    try {
      const all = await fetchAllPages<T>(endpoint);
      setItems(all.filter((r) => r.is_active));
    } catch {
      // silently fail — caller can check items.length
    }
  }, [endpoint]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  const comboOptions: ComboOption[] = useMemo(
    () =>
      items.map((r) => ({
        value: String(r.id),
        label: showCode ? `${r.code} ${r.name}` : r.name,
        displayLabel: r.name,
        color: r.color_hex ?? undefined,
      })),
    [items, showCode],
  );

  const create = useCallback(
    async (name: string): Promise<string | null> => {
      if (!endpoint) return null;
      try {
        const res = await api.post<{ data: T }>(endpoint, {
          code: randomCode(),
          name,
          ...extraCreateFields,
        });
        setItems((prev) => [...prev, res.data]);
        return String(res.data.id);
      } catch {
        return null;
      }
    },
    [endpoint, extraCreateFields],
  );

  const rename = useCallback(
    async (id: string, newName: string): Promise<boolean> => {
      if (!endpoint) return false;
      try {
        await api.put(`${endpoint}/${id}`, { name: newName });
        setItems((prev) =>
          prev.map((r) => (String(r.id) === id ? { ...r, name: newName } : r)),
        );
        return true;
      } catch {
        return false;
      }
    },
    [endpoint],
  );

  return { items, setItems, comboOptions, create, rename, refetch };
}
