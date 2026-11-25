// Ponto de entrada do backend: cria o app e começa a escutar na porta.
import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { prisma } from "./lib/prisma.js";

const app = createApp();

const server = app.listen(env.PORT, () => {
  console.log(`API do Armazém do Cimento rodando em http://localhost:${env.PORT} (${env.NODE_ENV})`);
});

// Encerramento organizado: ao receber o sinal de parada (Ctrl+C ou o
// provedor de hospedagem reiniciando), fecha o servidor e as conexões
// com o banco antes de sair.
async function shutdown(signal: string) {
  console.log(`Recebido ${signal}. Encerrando...`);
  server.close();
  await prisma.$disconnect();
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
