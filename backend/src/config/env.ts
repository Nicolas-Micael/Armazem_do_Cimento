// Lê e valida as variáveis de ambiente UMA vez, quando o servidor sobe.
//
// Por quê? Se faltar, por exemplo, a DATABASE_URL, é melhor o servidor
// recusar iniciar com uma mensagem clara do que quebrar depois, no meio
// de um pedido, com um erro confuso.
import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3333),
  FRONTEND_URL: z.url(),
  DATABASE_URL: z.string().startsWith("postgresql://"),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  // Mostra só os NOMES das variáveis com problema, nunca os valores
  // (que podem conter senhas).
  const problems = parsed.error.issues.map((issue) => `- ${issue.path.join(".")}: ${issue.message}`);
  console.error(`Variáveis de ambiente inválidas:\n${problems.join("\n")}`);
  process.exit(1);
}

export const env = parsed.data;
