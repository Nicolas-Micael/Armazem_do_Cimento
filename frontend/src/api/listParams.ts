import type { StatusFilter } from "./types";

export interface ListParams {
  search?: string;
  status?: StatusFilter;
  page?: number;
}

/** Monta "?search=...&status=...&page=..." a partir dos filtros. */
export function toQueryString(params: ListParams): string {
  const query = new URLSearchParams();
  if (params.search) query.set("search", params.search);
  if (params.status) query.set("status", params.status);
  if (params.page) query.set("page", String(params.page));
  const text = query.toString();
  return text ? `?${text}` : "";
}
