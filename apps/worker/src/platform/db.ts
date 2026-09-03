import { drizzle } from "drizzle-orm/d1";
import { schema } from "./schema";

export function createDb(database: D1Database) {
  return drizzle(database, { schema });
}

export type AppDatabase = ReturnType<typeof createDb>;
