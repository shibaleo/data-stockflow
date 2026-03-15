import { db } from "@/lib/db";
import { eventLog } from "@/lib/db/schema";
import type { Context } from "hono";
import type { AppVariables } from "@/middleware/context";

export interface EventEntry {
  action: string;
  entityType: string;
  entityKey: number;
  entityName?: string;
  summary: string;
  changes?: { field: string; from?: unknown; to?: unknown }[];
}

/**
 * Record a business-level event log entry. Fire-and-forget.
 */
export function recordEvent(
  c: Context<{ Variables: AppVariables }>,
  entry: EventEntry,
): void {
  const tenantKey = c.get("tenantKey") || null;
  const userKey = c.get("userKey");
  const userName = c.get("userName") ?? "unknown";
  const userRole = c.get("userRole");
  const sourceIp =
    c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ||
    c.req.header("x-real-ip") ||
    null;

  db.insert(eventLog)
    .values({
      tenant_key: tenantKey,
      user_key: userKey,
      user_name: userName,
      user_role: userRole,
      action: entry.action,
      entity_type: entry.entityType,
      entity_key: entry.entityKey,
      entity_name: entry.entityName ?? null,
      summary: entry.summary,
      changes: entry.changes ?? null,
      source_ip: sourceIp,
    })
    .catch((err: unknown) => {
      console.error("[event-log] Failed to record event:", err);
    });
}

/**
 * Compute field-level changes between old and new objects.
 * Returns only fields that actually changed.
 */
export function computeChanges(
  current: Record<string, unknown>,
  updated: Record<string, unknown>,
): { field: string; from?: unknown; to?: unknown }[] {
  const changes: { field: string; from?: unknown; to?: unknown }[] = [];
  for (const key of Object.keys(updated)) {
    if (key === "id" || key === "revision") continue;
    const oldVal = current[key];
    const newVal = updated[key];
    if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
      changes.push({ field: key, from: oldVal, to: newVal });
    }
  }
  return changes;
}
