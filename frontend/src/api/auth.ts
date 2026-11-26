import { apiRequest, jsonBody } from "./client";
import type { User } from "./types";

/** POST /api/auth/login — o backend responde com o usuário e grava o cookie. */
export function login(username: string, password: string) {
  return apiRequest<{ user: User }>("/auth/login", jsonBody("POST", { username, password }));
}

export function logout() {
  return apiRequest<void>("/auth/logout", { method: "POST" });
}

/** GET /api/auth/me — quem está logado (401 se ninguém). */
export function getMe() {
  return apiRequest<{ user: User }>("/auth/me");
}

export function changePassword(currentPassword: string, newPassword: string) {
  return apiRequest<{ user: User }>("/auth/change-password", jsonBody("POST", { currentPassword, newPassword }));
}
