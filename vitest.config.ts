import path from "node:path";
import { defineConfig } from "vitest/config";

// Banco próprio de teste (data/test.db), recriado a cada execução. Integrações externas sempre simuladas.
export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: {
    include: ["tests/**/*.test.ts"],
    globalSetup: ["tests/global-setup.ts"],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
    env: {
      NODE_ENV: "test",
      DATABASE_URL: "file:./data/test.db",
      AUTH_SECRET: "teste-auth-secret-com-mais-de-32-caracteres-0123456789",
      APP_ENCRYPTION_KEY: "teste-chave-cifra-com-mais-de-32-caracteres-0123456789",
      WHATSAPP_MODO: "mock",
      AI_PROVIDER: "mock",
      OPENAI_API_KEY: "",
      WHATSAPP_APP_SECRET: "segredo-do-app-de-teste",
      WHATSAPP_VERIFY_TOKEN: "token-verificacao-teste",
    },
  },
});
