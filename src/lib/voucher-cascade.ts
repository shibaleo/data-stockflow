/**
 * Voucher cascade — bumps voucher revision when journals change.
 *
 * Voucher is the "economic event" unit. Its lines_hash reflects
 * the aggregate state of all child journals. Any journal
 * create/update/deactivate/reverse triggers a new voucher revision.
 */
import { sql } from "drizzle-orm";
import { voucher } from "@/lib/db/schema";
import { getMaxRevision } from "@/lib/append-only";
import {
  computeVoucherContentHash,
  computeRevisionHash,
  getPrevVoucherRevisionHash,
} from "@/lib/hash-chain";
import type { VoucherRow } from "@/lib/types";

const S = "data_stockflow";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Tx = any;

interface VoucherOverrides {
  voucher_code?: string | null;
  description?: string | null;
  source_system?: string | null;
}

/**
 * Create a new voucher revision reflecting the current state of its journals.
 *
 * Call this inside the same transaction that modifies a journal.
 * For voucher-only metadata changes, pass overrides.
 */
export async function bumpVoucherRevision(
  tx: Tx,
  voucherKey: number,
  tenantKey: number,
  userKey: number,
  overrides?: VoucherOverrides,
): Promise<VoucherRow> {
  // 1. Get current voucher
  const { rows: vRows } = await tx.execute(sql`
    SELECT * FROM ${sql.raw(`"${S}".current_voucher`)}
    WHERE key = ${voucherKey}
    LIMIT 1
  `);
  if (vRows.length === 0) {
    throw new Error(`Voucher ${voucherKey} not found`);
  }
  const current = vRows[0] as VoucherRow;

  // 2. Get max revision
  const maxRev = await getMaxRevision("voucher", voucherKey);

  // 3. Get all current journal revision_hashes for this voucher
  const { rows: jRows } = await tx.execute(sql`
    SELECT revision_hash FROM ${sql.raw(`"${S}".current_journal`)}
    WHERE voucher_key = ${voucherKey}
    ORDER BY key
  `);
  const journalHashes = (jRows as { revision_hash: string }[]).map(
    (r) => r.revision_hash,
  );

  // 4. Compute voucher content hash from journal hashes
  const linesHash = computeVoucherContentHash(journalHashes);

  // 5. Compute revision hash
  const prevRevisionHash = await getPrevVoucherRevisionHash(
    tx,
    voucherKey,
    maxRev + 1,
  );

  const resolvedDesc =
    overrides?.description !== undefined
      ? overrides.description
      : current.description;

  const revisionHash = computeRevisionHash({
    prev_revision_hash: prevRevisionHash,
    journal_key: 0,
    revision: maxRev + 1,
    adjustment_flag: "none",
    description: resolvedDesc ?? null,
    lines_hash: linesHash,
  });

  // 6. Insert new voucher revision
  const [v] = await tx
    .insert(voucher)
    .values({
      key: voucherKey,
      revision: maxRev + 1,
      tenant_key: tenantKey,
      idempotency_key: current.idempotency_key,
      voucher_code:
        overrides?.voucher_code !== undefined
          ? overrides.voucher_code
          : current.voucher_code,
      description: resolvedDesc,
      source_system:
        overrides?.source_system !== undefined
          ? overrides.source_system
          : current.source_system,
      created_by: userKey,
      sequence_no: current.sequence_no,
      prev_header_hash: current.prev_header_hash,
      header_hash: current.header_hash,
      lines_hash: linesHash,
      prev_revision_hash: prevRevisionHash,
      revision_hash: revisionHash,
    })
    .returning();

  return v as unknown as VoucherRow;
}
