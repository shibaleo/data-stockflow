import { createApp } from "@/lib/create-app";
import { createRoute } from "@hono/zod-openapi";
import { z } from "@hono/zod-openapi";
import { db } from "@/lib/db";
import { entityColor } from "@/lib/db/schema";
import { requireAuth } from "@/middleware/guards";
import { and, eq, inArray } from "drizzle-orm";

const app = createApp();
app.use("*", requireAuth());

const hexColorRegex = /^#[0-9a-fA-F]{6}$/;

// GET /entity-colors?entity_type=account&keys=1,2,3
const listRoute = createRoute({
  method: "get" as const,
  path: "/",
  tags: ["EntityColors"],
  summary: "List colors for entities",
  request: {
    query: z.object({
      entity_type: z.string(),
      keys: z.string().optional(),
    }),
  },
  responses: {
    200: {
      description: "Success",
      content: {
        "application/json": {
          schema: z.object({
            data: z.record(z.string(), z.string()),
          }),
        },
      },
    },
  },
});

app.openapi(listRoute, async (c) => {
  const { entity_type, keys } = c.req.valid("query");
  const conditions = [eq(entityColor.entity_type, entity_type)];
  if (keys) {
    const keyList = keys.split(",").map(Number).filter((n) => !isNaN(n));
    if (keyList.length > 0) {
      conditions.push(inArray(entityColor.entity_key, keyList));
    }
  }
  const rows = await db
    .select()
    .from(entityColor)
    .where(and(...conditions));
  const result: Record<string, string> = {};
  for (const row of rows) {
    result[String(row.entity_key)] = row.color;
  }
  return c.json({ data: result }, 200);
});

// PUT /entity-colors — upsert
const upsertRoute = createRoute({
  method: "put" as const,
  path: "/",
  tags: ["EntityColors"],
  summary: "Set entity color",
  request: {
    body: {
      content: {
        "application/json": {
          schema: z.object({
            entity_type: z.string(),
            entity_key: z.number().int().positive(),
            color: z.string().regex(hexColorRegex).nullable(),
          }),
        },
      },
    },
  },
  responses: {
    200: {
      description: "Success",
      content: {
        "application/json": {
          schema: z.object({ message: z.string() }),
        },
      },
    },
  },
});

app.openapi(upsertRoute, async (c) => {
  const { entity_type, entity_key, color } = c.req.valid("json");
  if (color === null) {
    await db
      .delete(entityColor)
      .where(
        and(
          eq(entityColor.entity_type, entity_type),
          eq(entityColor.entity_key, entity_key),
        ),
      );
  } else {
    await db
      .insert(entityColor)
      .values({ entity_type, entity_key, color })
      .onConflictDoUpdate({
        target: [entityColor.entity_type, entityColor.entity_key],
        set: { color },
      });
  }
  return c.json({ message: "OK" }, 200);
});

export default app;
