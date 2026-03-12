import { Hono } from "hono";
import { prisma } from "@/lib/prisma";

const app = new Hono();

app.get("/", async (c) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return c.json({ status: "ok" });
  } catch {
    return c.json({ status: "error", message: "DB connection failed" }, 500);
  }
});

export default app;
