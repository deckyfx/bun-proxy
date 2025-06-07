import { db } from "@db/index";
import { user } from "@db/schema";

await db.insert(user).values({
  email: "admin@admin.com",
  password: "123456",
  name: "Administrator",
});
