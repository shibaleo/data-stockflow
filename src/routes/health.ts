import { Hono } from "hono";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";

const app = new Hono();

app.get("/", async (c) => {
  try {
    await db.execute(sql`SELECT 1`);
    return c.json({ status: "ok" });
  } catch {
    return c.json({ status: "error", message: "DB connection failed" }, 500);
  }
});

export default app;
