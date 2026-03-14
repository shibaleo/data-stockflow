import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";

// ── Constants ──

export const GENESIS_PREV_HASH = "0";

const S = "data_stockflow";

// ── Core hash ──

function sha256(...fields: string[]): string {
  return createHash("sha256").update(fields.join("|")).digest("hex");
}

// ── Entity hash (for all append-only tables) ──

export function computeEntityHash(fields: Record<string, unknown>): string {
  const sorted = Object.keys(fields)
    .sort()
    .map((k) => String(fields[k] ?? ""));
  return sha256(...sorted);
}

// ── Lines hash (journal lines) ──

export interface LineHashInput {
  line_group: number;
  side: string;
  account_key: number;
  department_key?: number | null;
  counterparty_key?: number | null;
  amount: string;
  description?: string | null;
}

export function computeLinesHash(lines: LineHashInput[]): string {
  if (lines.length === 0) return sha256("EMPTY_LINES");

  const sorted = [...lines].sort((a, b) => {
    if (a.line_group !== b.line_group) return a.line_group - b.line_group;
    if (a.side !== b.side) return a.side.localeCompare(b.side);
    return Number(a.amount) - Number(b.amount);
  });

  const parts = sorted.map((l) =>
    [
      String(l.line_group),
      l.side,
      String(l.account_key),
      l.department_key != null ? String(l.department_key) : "",
      l.counterparty_key != null ? String(l.counterparty_key) : "",
      l.amount,
      l.description ?? "",
    ].join("|")
  );

  return sha256(parts.join(";"));
}

// ── Revision chain hash (journal) ──

export interface RevisionHashInput {
  prev_revision_hash: string;
  journal_key: number;
  revision: number;
  journal_type: string;
  slip_category: string;
  adjustment_flag: string;
  description: string | null;
  lines_hash: string;
}

export function computeRevisionHash(input: RevisionHashInput): string {
  return sha256(
    input.prev_revision_hash,
    String(input.journal_key),
    String(input.revision),
    input.journal_type,
    input.slip_category,
    input.adjustment_flag,
    input.description ?? "",
    input.lines_hash
  );
}

// ── Header chain hash (voucher) ──

export interface HeaderHashInput {
  prev_header_hash: string;
  tenant_key: number;
  sequence_no: number;
  idempotency_key: string;
  created_at: string;
}

export function computeHeaderHash(input: HeaderHashInput): string {
  return sha256(
    input.prev_header_hash,
    String(input.tenant_key),
    String(input.sequence_no),
    input.idempotency_key,
    input.created_at
  );
}

// ── Transaction helpers ──

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Tx = any;

export async function acquireNextHeaderSequence(
  tx: Tx,
  tenantKey: number
): Promise<{ nextSequenceNo: number; prevHeaderHash: string }> {
  const lockKeyResult = await tx.execute(
    sql`SELECT hashtext(${String(tenantKey)}) AS lock_key`
  );
  const lockKey = (lockKeyResult.rows[0] as { lock_key: number }).lock_key;
  await tx.execute(sql`SELECT pg_advisory_xact_lock(${lockKey})`);

  const { rows } = await tx.execute(sql`
    SELECT sequence_no, header_hash
    FROM ${sql.raw(`"${S}".voucher`)}
    WHERE tenant_key = ${tenantKey}
    ORDER BY sequence_no DESC
    LIMIT 1
  `);

  if (rows.length === 0) {
    return { nextSequenceNo: 1, prevHeaderHash: GENESIS_PREV_HASH };
  }

  const latest = rows[0] as { sequence_no: number; header_hash: string };
  return {
    nextSequenceNo: latest.sequence_no + 1,
    prevHeaderHash: latest.header_hash,
  };
}

export async function getPrevRevisionHash(
  tx: Tx,
  journalKey: number,
  currentRevision: number
): Promise<string> {
  if (currentRevision === 1) return GENESIS_PREV_HASH;

  const { rows } = await tx.execute(sql`
    SELECT revision_hash
    FROM ${sql.raw(`"${S}".journal`)}
    WHERE key = ${journalKey}
      AND revision = ${currentRevision - 1}
    LIMIT 1
  `);

  if (rows.length === 0) {
    throw new Error(
      `Missing previous revision ${currentRevision - 1} for journal key ${journalKey}`
    );
  }

  return (rows[0] as { revision_hash: string }).revision_hash;
}
