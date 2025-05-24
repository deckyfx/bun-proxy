import { db } from "@db/index";
import { user } from "@db/schema";

await db.insert(user).values({
  username: "admin",
  password: "securepassword123",
});
