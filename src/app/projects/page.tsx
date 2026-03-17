"use client";

import { useMemo, useState, useEffect } from "react";
import { MasterPage, type ExtraField } from "@/components/shared/master-page";
import { fetchAllPages } from "@/lib/api-client";

interface DepartmentRow {
  id: number;
  code: string;
  name: string;
  color_hex?: string | null;
}

export default function ProjectsPage() {
  const [departments, setDepartments] = useState<DepartmentRow[]>([]);

  useEffect(() => {
    fetchAllPages<DepartmentRow>("/departments")
      .then(setDepartments)
      .catch(() => setDepartments([]));
  }, []);

  const deptMap = useMemo(
    () => new Map(departments.map((d) => [String(d.id), d])),
    [departments],
  );

  const deptOptions = useMemo(
    () => departments.map((d) => ({ value: String(d.id), label: `${d.code} ${d.name}` })),
    [departments],
  );

  const extraFields = useMemo<ExtraField[]>(
    () => [
      {
        key: "department_id",
        label: "部門",
        type: "select" as const,
        options: deptOptions,
        nullable: true,
        format: (v) => {
          if (v == null) return "";
          const d = deptMap.get(String(v));
          return d ? d.name : "";
        },
        badge: true,
        badgeColor: (v) => {
          if (v == null) return undefined;
          const d = deptMap.get(String(v));
          return d?.color_hex ?? undefined;
        },
      },
      {
        key: "start_date",
        label: "開始日",
        type: "date" as const,
        format: (v) => v ? String(v).slice(0, 10) : "",
        badge: false,
      },
      {
        key: "end_date",
        label: "終了日",
        type: "date" as const,
        format: (v) => v ? String(v).slice(0, 10) : "",
        badge: false,
      },
    ],
    [deptOptions, deptMap],
  );

  return (
    <MasterPage
      config={{
        title: "プロジェクト",
        endpoint: "/projects",
        parentKey: "parent_project_id",
        entityName: "プロジェクト",
        codePlaceholder: "例: proj-001",
        namePlaceholder: "例: 新規開発プロジェクト",
        extraFields,
        hasColor: true,
        entityType: "project",
      }}
    />
  );
}
