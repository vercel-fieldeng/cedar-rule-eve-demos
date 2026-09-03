import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

declare global {
  // eslint-disable-next-line no-var
  var __orderdeskPool: Pool | undefined;
}

/**
 * One shared pg Pool per process. Both the Next.js server and the eve runtime
 * import this module, so each process gets its own pool against the same Neon
 * database. That is the shared backend that lets the console and the agent
 * agree on policies, engine mode, and the decision log.
 */
export const pool =
  globalThis.__orderdeskPool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 5,
  });

if (process.env.NODE_ENV !== "production") {
  globalThis.__orderdeskPool = pool;
}

export const db = drizzle(pool, { schema });
export { schema };
