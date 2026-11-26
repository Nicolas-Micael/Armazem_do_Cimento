// Configuração do Prisma para o banco de TESTE (usada por "npm run test:db:prepare").
// Fica separada para funcionar igual no Windows, macOS e Linux, sem precisar
// definir variáveis de ambiente na linha de comando.
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: {
    url:
      process.env["TEST_DATABASE_URL"] ??
      "postgresql://armazem:armazem_dev@localhost:5432/armazem_test?schema=public",
  },
});
