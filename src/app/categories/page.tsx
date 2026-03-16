"use client";

import { MasterPage, type ExtraField } from "@/components/shared/master-page";

const CATEGORY_TYPES = [
  { value: "journal_type", label: "仕訳種別" },
  { value: "journal_tag", label: "仕訳タグ" },
];

const extraFields: ExtraField[] = [
  {
    key: "category_type_code",
    label: "分類種別",
    type: "select",
    options: CATEGORY_TYPES,
    format: (v) => CATEGORY_TYPES.find((t) => t.value === v)?.label ?? String(v),
  },
];

export default function CategoriesPage() {
  return (
    <MasterPage
      config={{
        title: "分類",
        endpoint: "/categories",
        parentKey: "parent_category_id",
        entityName: "分類",
        codePlaceholder: "例: normal",
        namePlaceholder: "例: 通常仕訳",
        extraFields,
      }}
    />
  );
}
