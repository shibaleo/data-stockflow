import { Hono } from "hono";
import { logger } from "hono/logger";
import health from "@/routes/health";

const app = new Hono().basePath("/api");

app.use("*", logger());
app.route("/health", health);

export default app;
