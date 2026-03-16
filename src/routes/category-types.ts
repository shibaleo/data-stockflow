import { createRoute, z } from "@hono/zod-openapi";
import { createApp } from "@/lib/create-app";
import { requireAuth } from "@/middleware/guards";
import { db } from "@/lib/db";
import { categoryType } from "@/lib/db/schema";

const app = createApp();
app.use("*", requireAuth());

const categoryTypeSchema = z.object({
  code: z.string(),
  entity_type: z.string(),
  name: z.string(),
  allow_multiple: z.boolean(),
});

const listRoute = createRoute({
  method: "get",
  path: "/",
  tags: ["Category Types"],
  summary: "List all category types",
  responses: {
    200: {
      description: "Category type list",
      content: {
        "application/json": {
          schema: z.object({ data: z.array(categoryTypeSchema) }),
        },
      },
    },
  },
});

app.openapi(listRoute, async (c) => {
  const rows = await db.select().from(categoryType);
  return c.json({ data: rows }, 200);
});

export default app;
