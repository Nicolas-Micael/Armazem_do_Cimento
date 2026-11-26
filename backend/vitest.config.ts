// Configuração dos testes.
// Os testes usam um banco SEPARADO (armazem_test), nunca o de desenvolvimento
// e muito menos o de produção. Pode ser sobrescrito pela variável
// TEST_DATABASE_URL.
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // Os arquivos de teste compartilham o mesmo banco de teste e o apagam
    // antes de cada teste; por isso rodam um de cada vez.
    fileParallelism: false,
    env: {
      NODE_ENV: "test",
      FRONTEND_URL: "http://localhost:5173",
      DATABASE_URL:
        process.env.TEST_DATABASE_URL ??
        "postgresql://armazem:armazem_dev@localhost:5432/armazem_test?schema=public",
    },
  },
});
