import type { ErrorHandler } from "hono";
import { HTTPException } from "hono/http-exception";

export const errorHandler: ErrorHandler = (err, c) => {
  if (err instanceof HTTPException) {
    return c.json({ error: err.message }, err.status);
  }

  // Prisma unique constraint violation
  if (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code: string }).code === "P2002"
  ) {
    return c.json({ error: "Unique constraint violation" }, 409);
  }

  // DB constraint trigger (journal balance)
  if (err.message?.includes("unbalanced")) {
    return c.json({ error: err.message }, 422);
  }

  console.error(err);
  return c.json({ error: "Internal server error" }, 500);
};
