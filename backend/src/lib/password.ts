// Hash de senhas.
//
// Nunca guardamos a senha em si. Guardamos um "hash": o resultado de uma
// função que é fácil de calcular num sentido e praticamente impossível
// de reverter. No login, calculamos o hash da senha digitada e
// comparamos com o hash guardado.
//
// Usamos o scrypt, que já vem no Node (módulo node:crypto). Ele é
// propositalmente LENTO e usa bastante memória, o que torna muito caro
// tentar adivinhar senhas em massa caso o banco vaze.
//
// Cada senha recebe um "sal" aleatório: duas pessoas com a mesma senha
// ficam com hashes diferentes.
import { randomBytes, scrypt as scryptCallback, timingSafeEqual, type ScryptOptions } from "node:crypto";

// Parâmetros do scrypt (custo). N = 2^15 é o valor recomendado para login interativo.
const PARAMS = { N: 32768, r: 8, p: 1 } as const;
const KEY_LENGTH = 64;
const SALT_BYTES = 16;
const MAX_MEMORY = 64 * 1024 * 1024; // 64 MB

function scrypt(password: string, salt: Buffer, options: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(password, salt, KEY_LENGTH, options, (error, key) => (error ? reject(error) : resolve(key)));
  });
}

/**
 * Recebe a senha em texto e retorna o texto que vai para o banco, no formato
 * "scrypt$N$r$p$sal$hash" (sal e hash em base64). Guardar os parâmetros junto
 * permite aumentar o custo no futuro sem invalidar as senhas antigas.
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const key = await scrypt(password, salt, { ...PARAMS, maxmem: MAX_MEMORY });
  return ["scrypt", PARAMS.N, PARAMS.r, PARAMS.p, salt.toString("base64"), key.toString("base64")].join("$");
}

/**
 * Confere se a senha digitada corresponde ao hash guardado.
 * Retorna true ou false; nunca lança erro por senha errada.
 */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algorithm, n, r, p, saltB64, keyB64] = stored.split("$");
  if (algorithm !== "scrypt" || !n || !r || !p || !saltB64 || !keyB64) return false;

  const expected = Buffer.from(keyB64, "base64");
  const actual = await scrypt(password, Buffer.from(saltB64, "base64"), {
    N: Number(n),
    r: Number(r),
    p: Number(p),
    maxmem: MAX_MEMORY,
  });
  // timingSafeEqual compara em tempo constante: não "entrega" pela demora
  // quantos caracteres estavam certos.
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/**
 * Hash de uma senha qualquer, usado quando o usuário digitado não existe.
 * Assim o login demora o mesmo tempo com usuário existente ou não, e quem
 * está tentando invadir não descobre quais nomes de usuário são válidos.
 */
export const DUMMY_PASSWORD_HASH = await hashPassword(randomBytes(16).toString("hex"));
