import { db } from "@/lib/db";
import { auditLog } from "@/lib/db/schema";
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
  | "voucher"
  | "journal"
  | "role"
  | "user"
  | "voucher_type"
  | "journal_type";

interface AuditEntry {
  action: AuditAction;
  entityType: AuditEntityType;
  entityKey: number;
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
  const tenantKey = c.get("tenantKey") || null;
  const userKey = c.get("userKey");
  const userRole = c.get("userRole");
  const sourceIp =
    c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ||
    c.req.header("x-real-ip") ||
    null;

  db.insert(auditLog)
    .values({
      tenant_key: tenantKey,
      user_key: userKey,
      user_role: userRole,
      action: entry.action,
      entity_type: entry.entityType,
      entity_key: entry.entityKey,
      revision: entry.revision ?? null,
      detail: entry.detail ? JSON.stringify(entry.detail) : null,
      source_ip: sourceIp,
    })
    .catch((err: unknown) => {
      console.error("[audit] Failed to record audit log:", err);
    });
}
