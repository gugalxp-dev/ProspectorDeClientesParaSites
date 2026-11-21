// Credenciais de terceiros. Ordem: variável de ambiente (.env) > cadastrada no painel (cifrada no banco).
// O valor nunca volta inteiro para o navegador: o painel só vê "configurado" e os 4 últimos caracteres.

import { cifrar, decifrar } from "@/lib/crypto";
import { env } from "@/lib/env";
import { db } from "./db";

export const CREDENCIAIS = {
  ANTHROPIC_API_KEY: { rotulo: "Chave da Anthropic (Claude)", grupo: "ia" },
  OPENAI_API_KEY: { rotulo: "Chave da OpenAI (opcional: provedor alternativo e embeddings)", grupo: "ia" },
  WHATSAPP_TOKEN: { rotulo: "Token de acesso permanente (System User)", grupo: "whatsapp" },
  WHATSAPP_PHONE_NUMBER_ID: { rotulo: "Phone Number ID", grupo: "whatsapp" },
  WHATSAPP_BUSINESS_ACCOUNT_ID: { rotulo: "WhatsApp Business Account ID", grupo: "whatsapp" },
  WHATSAPP_APP_SECRET: { rotulo: "App Secret (assinatura dos webhooks)", grupo: "whatsapp" },
  WHATSAPP_VERIFY_TOKEN: { rotulo: "Verify Token do webhook", grupo: "whatsapp" },
  GOOGLE_PLACES_API_KEY: { rotulo: "Chave da Google Places API (opcional, paga)", grupo: "prospeccao" },
} as const;

export type NomeCredencial = keyof typeof CREDENCIAIS;

export function ehCredencial(v: string): v is NomeCredencial {
  return v in CREDENCIAIS;
}

const cache = new Map<string, { valor: string | null; ate: number }>();

export async function credencial(nome: NomeCredencial): Promise<string | null> {
  const doEnv = env()[nome];
  if (doEnv) return doEnv;
  const c = cache.get(nome);
  if (c && c.ate > Date.now()) return c.valor;
  const s = await db.segredo.findUnique({ where: { chave: nome } });
  let valor: string | null = null;
  if (s) {
    try {
      valor = decifrar(s.cifrado);
    } catch {
      valor = null; // APP_ENCRYPTION_KEY trocada: a credencial precisa ser cadastrada de novo
    }
  }
  cache.set(nome, { valor, ate: Date.now() + 30_000 });
  return valor;
}

export async function salvarCredencial(nome: NomeCredencial, valor: string, usuarioId: string): Promise<void> {
  const v = valor.trim();
  await db.segredo.upsert({
    where: { chave: nome },
    create: { chave: nome, cifrado: cifrar(v), final: v.slice(-4), atualizadoPor: usuarioId },
    update: { cifrado: cifrar(v), final: v.slice(-4), atualizadoPor: usuarioId },
  });
  cache.delete(nome);
}

export async function removerCredencial(nome: NomeCredencial): Promise<void> {
  await db.segredo.deleteMany({ where: { chave: nome } });
  cache.delete(nome);
}

export interface EstadoCredencial {
  nome: NomeCredencial;
  rotulo: string;
  grupo: string;
  origem: "env" | "painel" | null;
  final: string | null;
}

/** O que o painel pode ver: de onde vem e os 4 últimos caracteres. */
export async function estadoCredenciais(): Promise<EstadoCredencial[]> {
  const salvos = await db.segredo.findMany({ select: { chave: true, final: true } });
  return (Object.keys(CREDENCIAIS) as NomeCredencial[]).map((nome) => {
    const doEnv = env()[nome];
    const salvo = salvos.find((s) => s.chave === nome);
    return {
      nome,
      ...CREDENCIAIS[nome],
      origem: doEnv ? "env" : salvo ? "painel" : null,
      final: doEnv ? doEnv.slice(-4) : (salvo?.final ?? null),
    };
  });
}
