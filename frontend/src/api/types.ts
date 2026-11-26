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
