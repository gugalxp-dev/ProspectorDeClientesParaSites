// Variáveis de ambiente, validadas uma vez. Segredos só existem no servidor: nada aqui vai para o navegador.

import { z } from "zod";

const vazioComoUndefined = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);
const opcional = z.preprocess(vazioComoUndefined, z.string().optional());

const esquema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  DATABASE_URL: z.string().default("file:./data/app.db"),
  APP_URL: z.preprocess(vazioComoUndefined, z.string().url().optional()),
  AUTH_SECRET: opcional,
  APP_ENCRYPTION_KEY: opcional,

  AI_PROVIDER: z.preprocess(vazioComoUndefined, z.enum(["anthropic", "openai", "mock"]).optional()),
  ANTHROPIC_API_KEY: opcional,
  OPENAI_API_KEY: opcional,
  OPENAI_BASE_URL: z.preprocess(vazioComoUndefined, z.string().url().default("https://api.openai.com/v1")),

  WHATSAPP_MODO: z.preprocess(vazioComoUndefined, z.enum(["cloud", "baileys", "mock"]).optional()),
  /** Porta local (só 127.0.0.1) em que o worker expõe a conexão Baileys para o painel. */
  BAILEYS_PORTA: z.preprocess(vazioComoUndefined, z.coerce.number().int().min(1024).max(65535).default(3011)),
  WHATSAPP_TOKEN: opcional,
  WHATSAPP_PHONE_NUMBER_ID: opcional,
  WHATSAPP_BUSINESS_ACCOUNT_ID: opcional,
  WHATSAPP_APP_SECRET: opcional,
  WHATSAPP_VERIFY_TOKEN: opcional,
  WHATSAPP_API_VERSION: z.preprocess(vazioComoUndefined, z.string().regex(/^v\d+\.\d+$/).default("v23.0")),

  CRAWLER_CONTATO: opcional,
});

export type Env = z.infer<typeof esquema>;

let cache: Env | null = null;

export function env(): Env {
  if (!cache) cache = esquema.parse(process.env);
  return cache;
}

/** Só para testes. */
export function recarregarEnv(): void {
  cache = null;
}

/** Segredo obrigatório do próprio app (não de terceiros). Falha alto em vez de rodar inseguro. */
export function segredoApp(nome: "AUTH_SECRET" | "APP_ENCRYPTION_KEY"): string {
  const v = env()[nome];
  if (!v || v.length < 32) {
    throw new Error(`${nome} ausente ou curto demais no .env (mínimo 32 caracteres). Rode "npm run setup" para gerar.`);
  }
  return v;
}
