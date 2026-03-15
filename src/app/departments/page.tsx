"use client";

import { MasterPage } from "@/components/shared/master-page";

export default function DepartmentsPage() {
  return (
    <MasterPage
      config={{
        title: "部門",
        endpoint: "/departments",
        parentKey: "parent_department_id",
        entityName: "部門",
        codePlaceholder: "例: sales",
        namePlaceholder: "例: 営業部",
      }}
    />
  );
}
