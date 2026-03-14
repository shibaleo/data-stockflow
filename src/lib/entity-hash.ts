import { createHash } from "node:crypto";
import { GENESIS_PREV_HASH } from "./hash-chain";

function sha256(...fields: string[]): string {
  return createHash("sha256").update(fields.join("|")).digest("hex");
}

/**
 * Compute lines_hash + revision_hash for a master entity revision.
 * "lines_hash" for master entities = hash of the entity's own fields.
 */
export function computeMasterHashes(
  entityFields: Record<string, unknown>,
  prevRevisionHash: string | null
): { lines_hash: string; prev_revision_hash: string; revision_hash: string } {
  const prev = prevRevisionHash ?? GENESIS_PREV_HASH;
  const sorted = Object.keys(entityFields)
    .sort()
    .map((k) => String(entityFields[k] ?? ""));
  const linesHash = sha256(...sorted);
  const revisionHash = sha256(prev, linesHash);
  return {
    lines_hash: linesHash,
    prev_revision_hash: prev,
    revision_hash: revisionHash,
  };
}
