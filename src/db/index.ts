import { Database } from "bun:sqlite";

import { drizzle } from "drizzle-orm/bun-sqlite";

import Config from "@src/config";

export const sqlite = new Database(Config.DATABASE_URL);

export const db = drizzle(sqlite);
