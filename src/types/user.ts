import type { UserType } from "@db/schema/user";

export interface UserProfile extends UserType {}

export interface UpdateUserRequest extends Partial<Pick<UserType, "email" | "username" | "password" | "name">> {}