import { apiRequest, jsonBody } from "./client";
import type { Role, User } from "./types";

export function listUsers() {
  return apiRequest<{ users: User[] }>("/users");
}

export interface CreateUserData {
  name: string;
  username: string;
  role: Role;
  temporaryPassword: string;
}

export function createUser(data: CreateUserData) {
  return apiRequest<{ user: User }>("/users", jsonBody("POST", data));
}

export function updateUser(id: string, data: Partial<Pick<User, "name" | "role" | "active">>) {
  return apiRequest<{ user: User }>(`/users/${id}`, jsonBody("PATCH", data));
}

export function resetUserPassword(id: string, temporaryPassword: string) {
  return apiRequest<{ user: User }>(`/users/${id}/reset-password`, jsonBody("POST", { temporaryPassword }));
}
