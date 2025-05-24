import { migrate } from "drizzle-orm/bun-sqlite/migrator";

import { db } from "@db/index";

migrate(db, {
  migrationsFolder: "./src/db/drizzle",
});
  