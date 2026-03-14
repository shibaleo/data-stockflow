import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const globalForDb = globalThis as unknown as { db: any };

function createDb() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  return drizzle({ client: pool });
}

export const db = globalForDb.db || createDb();

if (process.env.NODE_ENV !== "production") globalForDb.db = db;
