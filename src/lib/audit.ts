import { prisma } from "@/lib/prisma";
import type { Context } from "hono";
import type { AppVariables } from "@/middleware/context";

export type AuditAction =
  | "create"
  | "update"
  | "deactivate"
  | "restore"
  | "reverse"
  | "close"
  | "reopen";

export type AuditEntityType =
  | "book"
  | "account"
  | "tag"
  | "department"
  | "fiscal_period"
  | "counterparty"
  | "tax_class"
  | "tenant_setting"
  | "account_mapping"
  | "payment_mapping"
  | "journal";

interface AuditEntry {
  action: AuditAction;
  entityType: AuditEntityType;
  entityCode: string;
  revision?: number;
  detail?: unknown;
}

/**
 * Record an audit log entry. Fire-and-forget — does not block the response.
 */
export function recordAudit(
  c: Context<{ Variables: AppVariables }>,
  entry: AuditEntry
): void {
  const tenantId = c.get("tenantId") || null;
  const userId = c.get("userId");
  const userRole = c.get("userRole");
  const sourceIp =
    c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ||
    c.req.header("x-real-ip") ||
    null;

  // Fire-and-forget: don't await, don't block API response
  prisma.auditLog
    .create({
      data: {
        tenant_id: tenantId,
        user_id: userId,
        user_role: userRole,
        action: entry.action,
        entity_type: entry.entityType,
        entity_code: entry.entityCode,
        revision: entry.revision ?? null,
        detail: entry.detail ? JSON.stringify(entry.detail) : null,
        source_ip: sourceIp,
      },
    })
    .catch((err) => {
      console.error("[audit] Failed to record audit log:", err);
    });
}
