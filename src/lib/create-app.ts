import { OpenAPIHono } from "@hono/zod-openapi";
import type { AppVariables } from "@/middleware/context";

/**
 * Create an OpenAPIHono instance with standardized defaultHook
 * for consistent Zod validation error responses.
 */
export function createApp() {
  return new OpenAPIHono<{ Variables: AppVariables }>({
    defaultHook: (result, c) => {
      if (!result.success) {
        const firstIssue = result.error.issues[0];
        const msg = firstIssue
          ? `${firstIssue.path.join(".")}: ${firstIssue.message}`
          : "Validation error";
        return c.json({ error: msg }, 400);
      }
    },
  });
}
