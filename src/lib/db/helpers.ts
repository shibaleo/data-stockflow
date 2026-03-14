/**
 * Check if an error is a PostgreSQL unique constraint violation (23505).
 * Replaces Prisma's P2002 error code.
 */
export function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code: string }).code === "23505"
  );
}
