// Códigos de sessão (o "crachá" que o navegador guarda no cookie).
import { createHash, randomBytes } from "node:crypto";

/** Gera um código aleatório e imprevisível (32 bytes = 256 bits). */
export function generateSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

/**
 * Hash SHA-256 do código. É isto que fica no banco: se alguém ler a tabela
 * de sessões, não consegue usar os valores para entrar no sistema.
 * (Aqui um hash rápido basta, porque o código já é aleatório e longo.)
 */
export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
