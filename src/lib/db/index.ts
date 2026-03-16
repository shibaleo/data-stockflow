import { drizzle } from "drizzle-orm/neon-serverless";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import { Pool as NeonPool, neonConfig } from "@neondatabase/serverless";
import pg from "pg";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const globalForDb = globalThis as unknown as { db: any };

function isNeonUrl(url: string) {
  return url.includes("neon.tech");
}

function createDb() {
  const url = process.env.DATABASE_URL!;
  if (isNeonUrl(url)) {
    // Node.js environments (scripts, non-edge) need ws for Neon WebSocket
    if (typeof globalThis.WebSocket === "undefined") {
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        neonConfig.webSocketConstructor = require("ws");
      } catch { /* edge runtime — WebSocket already available */ }
    }
    const pool = new NeonPool({ connectionString: url });
    return drizzle({ client: pool });
  }
  const pool = new pg.Pool({ connectionString: url });
  return drizzlePg({ client: pool });
}

export const db = globalForDb.db || createDb();

if (process.env.NODE_ENV !== "production") globalForDb.db = db;
