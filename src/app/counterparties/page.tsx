"use client";

import { MasterPage } from "@/components/shared/master-page";

export default function CounterpartiesPage() {
  return (
    <MasterPage
      config={{
        title: "取引先",
        endpoint: "/counterparties",
        parentKey: "parent_counterparty_id",
        entityName: "取引先",
        codePlaceholder: "例: vendor-001",
        namePlaceholder: "例: 株式会社サンプル",
        hasColor: true,
        entityType: "counterparty",
      }}
    />
  );
}
