"use client";

import { MasterPage } from "@/components/shared/master-page";

export default function VoucherTypesPage() {
  return (
    <MasterPage
      config={{
        title: "伝票種別",
        endpoint: "/voucher-types",
        parentKey: "parent_voucher_type_id",
        entityName: "伝票種別",
        codePlaceholder: "例: purchase",
        namePlaceholder: "例: 仕入伝票",
      }}
    />
  );
}
