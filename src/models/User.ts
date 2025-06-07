import { eq } from "drizzle-orm";

import { db } from "@db/index";
import { user as userTable, type UserType } from "@db/schema";

import type { ErrorableResult } from "@typed/index";

export class User implements UserType {
  private _data: UserType;

  // Declare keys for type hints
  readonly id!: number;
  readonly email!: string;
  readonly password!: string;
  readonly name!: string;
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

  static async signin(
    email: string,
    password: string
  ): Promise<ErrorableResult<User>> {
    const records = await db
      .select()
      .from(userTable)
      .where(eq(userTable.email, email))
      .limit(1);

    if (records.length <= 0) return [null, new Error("No user found")];
    const record = records[0]!;

    const valid = password === record.password;
    if (!valid) return [null, new Error("Invalid credentials")];

    // Update last_login
    const updated = await db
      .update(userTable)
      .set({ last_login: new Date().toISOString() })
      .where(eq(userTable.id, record.id))
      .returning();

    if (updated.length > 0) {
      return [new User(updated[0]!), null];
    }

    return [null, new Error("General error")];
  }

  static async signup(
    email: string,
    password: string,
    name: string
  ): Promise<ErrorableResult<User>> {
    const records = await db
      .select()
      .from(userTable)
      .where(eq(userTable.email, email))
      .limit(1);

    if (records.length > 0) return [null, new Error("Email already used")];

    // Update last_login
    const inserted = await db
      .insert(userTable)
      .values([{ email, password, name }])
      .returning();

    if (inserted.length > 0) {
      return [new User(inserted[0]!), null];
    }

    return [null, new Error("General Error")];
  }

  static async logout(): Promise<void> {
    // Placeholder — typically handled via token/session logic
    console.log("Logout called (no-op)");
  }
}
