import { apiRequest } from "./client";

export interface HealthResponse {
  status: "ok" | "degraded";
  database: "ok" | "unavailable";
  time: string;
}

/** GET /api/health — confere se a API e o banco estão no ar. */
export function getHealth() {
  return apiRequest<HealthResponse>("/health");
}
