// Configuração do Prisma (versão 7+): diz onde está o schema,
// onde ficam as migrations e qual banco usar.
import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    // Comando executado por "npx prisma db seed" (cria o primeiro ADM).
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: process.env["DATABASE_URL"],
  },
});
