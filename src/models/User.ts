import { db } from "@db/index";
import { user as userTable, type UserType } from "@db/schema";
import { eq } from "drizzle-orm";

export class User {
  private _data: UserType;

  // Declare keys for type hints
  readonly id!: number;
  readonly username!: string;
  readonly password!: string;
  readonly last_login!: string | null;

  constructor(record: UserType) {
    this._data = record;

    for (const key of Object.keys(record) as (keyof UserType)[]) {
      Object.defineProperty(this, key, {
        get: () => this._data[key],
        enumerable: false,
      });
    }
  }

  get public() {
    const { password, ...rest } = this._data;
    return rest;
  }

  static async register(
    username: string,
    password: string
  ): Promise<User | null> {
    const inserted = await db
      .insert(userTable)
      .values({
        username,
        password,
      })
      .returning();

    if (inserted.length > 0) {
      return new User(inserted[0]!);
    }

    return null;
  }

  static async login(username: string, password: string): Promise<User | null> {
    const result = await db
      .select()
      .from(userTable)
      .where(eq(userTable.username, username))
      .limit(1);

    const record = result[0];
    if (!record) return null;

    const valid = password === record.password;
    if (!valid) return null;

    // Update last_login
    const updated = await db
      .update(userTable)
      .set({ last_login: new Date().toISOString() })
      .where(eq(userTable.id, record.id))
      .returning();

    if (updated.length > 0) {
      return new User(updated[0]!);
    }

    return null;
  }

  static async logout(): Promise<void> {
    // Placeholder — typically handled via token/session logic
    console.log("Logout called (no-op)");
  }
}
