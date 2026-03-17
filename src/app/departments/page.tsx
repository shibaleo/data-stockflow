"use client";

import { useMemo, useState, useEffect } from "react";
import { MasterPage, type ExtraField } from "@/components/shared/master-page";
import { fetchAllPages } from "@/lib/api-client";

interface CategoryRow {
  id: number;
  code: string;
  name: string;
  category_type_code: string;
  color_hex?: string | null;
}

export default function DepartmentsPage() {
  const [deptTypes, setDeptTypes] = useState<CategoryRow[]>([]);

  useEffect(() => {
    fetchAllPages<CategoryRow>("/categories")
      .then((all) => setDeptTypes(all.filter((c) => c.category_type_code === "department_type")))
      .catch(() => setDeptTypes([]));
  }, []);

  const codeToKey = useMemo(
    () => new Map(deptTypes.map((c) => [c.code, c])),
    [deptTypes],
  );

  const typeOptions = useMemo(
    () => deptTypes.map((c) => ({ value: c.code, label: c.name })),
    [deptTypes],
  );

  const extraFields = useMemo<ExtraField[]>(
    () => [
      {
        key: "department_type",
        label: "部門種別",
        type: "select" as const,
        options: typeOptions,
        nullable: true,
        format: (v) => {
          if (v == null) return "";
          const dt = deptTypes.find((c) => c.code === v);
          return dt ? dt.name : "";
        },
        badge: true,
        badgeColor: (v) => {
          if (v == null) return undefined;
          const cat = codeToKey.get(String(v));
          return cat?.color_hex ?? undefined;
        },
      },
    ],
    [typeOptions, deptTypes, codeToKey],
  );

  return (
    <MasterPage
      config={{
        title: "部門",
        endpoint: "/departments",
        parentKey: "parent_department_id",
        entityName: "部門",
        codePlaceholder: "例: sales",
        namePlaceholder: "例: 営業部",
        extraFields,
        hasColor: true,
        entityType: "department",
      }}
    />
  );
}
