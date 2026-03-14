import type { ErrorHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import { isUniqueViolation } from "@/lib/db/helpers";

export const errorHandler: ErrorHandler = (err, c) => {
  if (err instanceof HTTPException) {
    return c.json({ error: err.message }, err.status);
  }

  // PostgreSQL unique constraint violation (23505)
  if (isUniqueViolation(err)) {
    return c.json({ error: "Unique constraint violation" }, 409);
  }

  // DB constraint trigger (journal balance)
  if (err.message?.includes("unbalanced")) {
    return c.json({ error: err.message }, 422);
  }

  console.error(err);
  return c.json({ error: "Internal server error" }, 500);
};
