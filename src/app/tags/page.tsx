"use client";

import { MasterPage, type ExtraField } from "@/components/shared/master-page";

const TAG_TYPES = [
  { value: "general", label: "ラベル" },
  { value: "relation", label: "人間関係" },
  { value: "source", label: "データ出自" },
];

const extraFields: ExtraField[] = [
  {
    key: "tag_type",
    label: "種別",
    type: "select",
    options: TAG_TYPES,
    format: (v) => TAG_TYPES.find((t) => t.value === v)?.label ?? String(v),
  },
];

export default function TagsPage() {
  return (
    <MasterPage
      config={{
        title: "タグ",
        endpoint: "/tags",
        parentKey: "parent_tag_id",
        entityName: "タグ",
        codePlaceholder: "例: important",
        namePlaceholder: "例: 重要",
        extraFields,
      }}
    />
  );
}
