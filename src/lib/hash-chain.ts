import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";

// ── Constants ──

export const GENESIS_PREV_HASH = "0";
export const PRE_CHAIN_HASH = "PRE_CHAIN";

const S = "data_stockflow";

// ── Core hash ──

function sha256(...fields: string[]): string {
  return createHash("sha256").update(fields.join("|")).digest("hex");
}

// ── Lines hash ──

export interface LineHashInput {
  line_group: number;
  side: string;
  account_code: string;
  department_code?: string | null;
  counterparty_code?: string | null;
  tax_class_code?: string | null;
  tax_rate?: string | null;
  is_reduced?: boolean | null;
  amount: string;
  description?: string | null;
}

export function computeLinesHash(lines: LineHashInput[]): string {
  if (lines.length === 0) return sha256("EMPTY_LINES");

  const sorted = [...lines].sort((a, b) => {
    if (a.line_group !== b.line_group) return a.line_group - b.line_group;
    if (a.side !== b.side) return a.side.localeCompare(b.side);
    if (a.account_code !== b.account_code)
      return a.account_code.localeCompare(b.account_code);
    return a.amount.localeCompare(b.amount);
  });

  const parts = sorted.map((l) =>
    [
      String(l.line_group),
      l.side,
      l.account_code,
      l.department_code ?? "",
      l.counterparty_code ?? "",
      l.tax_class_code ?? "",
      l.tax_rate ?? "",
      l.is_reduced != null ? String(l.is_reduced) : "",
      l.amount,
      l.description ?? "",
    ].join("|"),
  );

  return sha256(parts.join(";"));
}

// ── Revision chain hash ──

export interface RevisionHashInput {
  prev_revision_hash: string;
  idempotency_code: string;
  revision: number;
  posted_date: string;
  journal_type: string;
  slip_category: string;
  adjustment_flag: string;
  description: string | null;
  source_system: string | null;
  lines_hash: string;
}

export function computeRevisionHash(input: RevisionHashInput): string {
  return sha256(
    input.prev_revision_hash,
    input.idempotency_code,
    String(input.revision),
    input.posted_date,
    input.journal_type,
    input.slip_category,
    input.adjustment_flag,
    input.description ?? "",
    input.source_system ?? "",
    input.lines_hash,
  );
}

// ── Header chain hash ──

export interface HeaderHashInput {
  prev_header_hash: string;
  tenant_id: string;
  sequence_no: number;
  idempotency_code: string;
  created_at: string;
}

export function computeHeaderHash(input: HeaderHashInput): string {
  return sha256(
    input.prev_header_hash,
    input.tenant_id,
    String(input.sequence_no),
    input.idempotency_code,
    input.created_at,
  );
}

// ── Transaction helpers ──

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Tx = any;

export async function acquireNextHeaderSequence(
  tx: Tx,
  tenantId: string,
): Promise<{ nextSequenceNo: number; prevHeaderHash: string }> {
  const lockKeyResult = await tx.execute(
    sql`SELECT hashtext(${tenantId}) AS lock_key`,
  );
  const lockKey = (lockKeyResult.rows[0] as { lock_key: number }).lock_key;
  await tx.execute(sql`SELECT pg_advisory_xact_lock(${lockKey})`);

  const { rows } = await tx.execute(sql`
    SELECT sequence_no, header_hash
    FROM "${sql.raw(S)}"."journal_header"
    WHERE tenant_id = ${tenantId}
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
  idempotencyCode: string,
  currentRevision: number,
): Promise<string> {
  if (currentRevision === 1) return GENESIS_PREV_HASH;

  const { rows } = await tx.execute(sql`
    SELECT revision_hash
    FROM "${sql.raw(S)}"."journal"
    WHERE idempotency_code = ${idempotencyCode}
      AND revision = ${currentRevision - 1}
    LIMIT 1
  `);

  if (rows.length === 0) {
    throw new Error(
      `Missing previous revision ${currentRevision - 1} for ${idempotencyCode}`,
    );
  }

  return (rows[0] as { revision_hash: string }).revision_hash;
}
