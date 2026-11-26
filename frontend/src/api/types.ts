// Tipos dos dados que a API devolve (espelham o backend).

export type Role = "ADMIN" | "FINANCEIRO";

export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: "Administrador (ADM)",
  FINANCEIRO: "Financeiro",
};

/** Versão curta, usada no cabeçalho. */
export const ROLE_SHORT_LABELS: Record<Role, string> = {
  ADMIN: "ADM",
  FINANCEIRO: "Financeiro",
};

export interface User {
  id: string;
  name: string;
  username: string;
  role: Role;
  active: boolean;
  mustChangePassword: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

export type StatusFilter = "active" | "inactive" | "all";

/** Resposta paginada das listagens. */
export interface Page {
  total: number;
  page: number;
  pageSize: number;
}

export interface Customer {
  id: string;
  name: string;
  /** Só números. */
  document: string | null;
  phone: string | null;
  street: string | null;
  number: string | null;
  complement: string | null;
  district: string | null;
  city: string | null;
  state: string | null;
  zipCode: string | null;
  notes: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Product {
  id: string;
  name: string;
  brand: string | null;
  cementType: string | null;
  /** Texto decimal, ex.: "50". */
  bagWeightKg: string | null;
  unit: string;
  /** Texto decimal com 2 casas, ex.: "38.90". */
  currentPrice: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PriceHistoryEntry {
  changedAt: string;
  changedBy: string;
  previousPrice: string | null;
  newPrice: string | null;
}
