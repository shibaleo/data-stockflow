"use client";

import { MasterPage, type ExtraField } from "@/components/shared/master-page";

const extraFields: ExtraField[] = [
  {
    key: "start_date",
    label: "開始日",
    type: "date",
    format: (v) => String(v).slice(0, 10),
  },
  {
    key: "end_date",
    label: "終了日",
    type: "date",
    format: (v) => String(v).slice(0, 10),
  },
];

export default function ProjectsPage() {
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
      }}
    />
  );
}
