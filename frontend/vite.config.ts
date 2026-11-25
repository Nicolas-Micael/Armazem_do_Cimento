// Configuração do Vite (servidor de desenvolvimento e build do frontend).
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Em desenvolvimento, tudo que começar com /api é repassado ao backend.
    // Assim o navegador "acha" que frontend e API estão no mesmo endereço,
    // o que simplifica o cookie de login (etapa 2).
    proxy: {
      "/api": "http://localhost:3333",
    },
  },
});
