"use client";

import { useState, useEffect } from "react";
import { MasterPage, type ExtraField, type GroupConfig } from "@/components/shared/master-page";
import { api } from "@/lib/api-client";

interface CategoryType {
  code: string;
  entity_type: string;
  name: string;
  allow_multiple: boolean;
}

export default function CategoriesPage() {
  const [types, setTypes] = useState<CategoryType[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get<{ data: CategoryType[] }>("/category-types")
      .then((res) => setTypes(res.data.filter((ct) => !ct.allow_multiple)))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        読み込み中...
      </div>
    );
  }

  const sections: [string, string][] = types.map((ct) => [ct.code, ct.name]);

  const groupBy: GroupConfig = {
    field: "category_type_code",
    sections,
  };

  const extraFields: ExtraField[] = [
    {
      key: "category_type_code",
      label: "分類種別",
      type: "select",
      options: sections.map(([value, label]) => ({ value, label })),
      format: (v) => types.find((ct) => ct.code === v)?.name ?? String(v),
      badge: false,
    },
  ];

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
        dialogExtraFields: extraFields,
        groupBy,
        hasColor: true,
        entityType: "category",
      }}
    />
  );
}
