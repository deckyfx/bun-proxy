import { eq, or } from "drizzle-orm";

import { db } from "@db/index";
import { user as userTable, type UserType } from "@db/schema";

import type { ErrorableResult } from "@typed/index";

export class User implements UserType {
  private _data: UserType;

  // Declare keys for type hints
  readonly id!: number;
  readonly email!: string;
  readonly username!: string;
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
    emailOrUsername: string,
    password: string
  ): Promise<ErrorableResult<User>> {
    const records = await db
      .select()
      .from(userTable)
      .where(or(eq(userTable.email, emailOrUsername), eq(userTable.username, emailOrUsername)))
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
    username: string,
    password: string,
    name: string
  ): Promise<ErrorableResult<User>> {
    // Check if email or username already exists
    const existingRecords = await db
      .select()
      .from(userTable)
      .where(or(eq(userTable.email, email), eq(userTable.username, username)))
      .limit(1);

    if (existingRecords.length > 0) {
      const existing = existingRecords[0]!;
      if (existing.email === email) {
        return [null, new Error("Email already used")];
      }
      if (existing.username === username) {
        return [null, new Error("Username already used")];
      }
    }

    // Insert new user
    const inserted = await db
      .insert(userTable)
      .values([{ email, username, password, name }])
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

  // CRUD operations
  static async findAll(): Promise<User[]> {
    const records = await db.select().from(userTable);
    return records.map(record => new User(record));
  }

  static async findById(id: number): Promise<User | null> {
    const records = await db
      .select()
      .from(userTable)
      .where(eq(userTable.id, id))
      .limit(1);

    if (records.length === 0) return null;
    return new User(records[0]!);
  }

  static async findByEmail(email: string): Promise<User | null> {
    const records = await db
      .select()
      .from(userTable)
      .where(eq(userTable.email, email))
      .limit(1);

    if (records.length === 0) return null;
    return new User(records[0]!);
  }

  static async findByUsername(username: string): Promise<User | null> {
    const records = await db
      .select()
      .from(userTable)
      .where(eq(userTable.username, username))
      .limit(1);

    if (records.length === 0) return null;
    return new User(records[0]!);
  }

  static async findByEmailOrUsername(emailOrUsername: string): Promise<User | null> {
    const records = await db
      .select()
      .from(userTable)
      .where(or(eq(userTable.email, emailOrUsername), eq(userTable.username, emailOrUsername)))
      .limit(1);

    if (records.length === 0) return null;
    return new User(records[0]!);
  }

  static async create(
    email: string,
    username: string,
    password: string,
    name: string
  ): Promise<ErrorableResult<User>> {
    // Check if email or username already exists
    const existingByEmail = await User.findByEmail(email);
    if (existingByEmail) {
      return [null, new Error("Email already used")];
    }

    const existingByUsername = await User.findByUsername(username);
    if (existingByUsername) {
      return [null, new Error("Username already used")];
    }

    const inserted = await db
      .insert(userTable)
      .values({ email, username, password, name })
      .returning();

    if (inserted.length > 0) {
      return [new User(inserted[0]!), null];
    }

    return [null, new Error("Failed to create user")];
  }

  async update(
    updates: Partial<{ email: string; username: string; password: string; name: string }>
  ): Promise<ErrorableResult<User>> {
    // If updating email, check if it's already used by another user
    if (updates.email && updates.email !== this.email) {
      const existingUser = await User.findByEmail(updates.email);
      if (existingUser && existingUser.id !== this.id) {
        return [null, new Error("Email already in use")];
      }
    }

    // If updating username, check if it's already used by another user
    if (updates.username && updates.username !== this.username) {
      const existingUser = await User.findByUsername(updates.username);
      if (existingUser && existingUser.id !== this.id) {
        return [null, new Error("Username already in use")];
      }
    }

    // Filter out undefined values
    const updateData = Object.fromEntries(
      Object.entries(updates).filter(([_, value]) => value !== undefined)
    );

    if (Object.keys(updateData).length === 0) {
      return [this, null]; // No updates needed
    }

    const updated = await db
      .update(userTable)
      .set(updateData)
      .where(eq(userTable.id, this.id))
      .returning();

    if (updated.length > 0) {
      return [new User(updated[0]!), null];
    }

    return [null, new Error("Failed to update user")];
  }

  async delete(): Promise<ErrorableResult<boolean>> {
    // Prevent deletion of superadmin (ID 1)
    if (this.id === 1) {
      return [null, new Error("Cannot delete superadmin")];
    }

    const deleted = await db
      .delete(userTable)
      .where(eq(userTable.id, this.id))
      .returning();

    return [deleted.length > 0, null];
  }

  static async deleteById(id: number): Promise<ErrorableResult<boolean>> {
    const user = await User.findById(id);
    if (!user) {
      return [null, new Error("User not found")];
    }

    return await user.delete();
  }
}
