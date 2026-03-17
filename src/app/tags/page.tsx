"use client";

import { MasterPage } from "@/components/shared/master-page";

export default function TagsPage() {
  return (
    <MasterPage
      config={{
        title: "タグ",
        endpoint: "/categories",
        parentKey: "parent_category_id",
        entityName: "タグ",
        codePlaceholder: "例: fixed",
        namePlaceholder: "例: 固定費",
        defaultExtraValues: { category_type_code: "journal_tag" },
        clientFilter: (item) => item.category_type_code === "journal_tag",
        hasColor: true,
        entityType: "category",
      }}
    />
  );
}
