// Rate limit por janela deslizante, guardado no banco para valer entre processos (web e worker).

import { db } from "@/core/db";

export async function dentroDoLimite(chave: string, limite: number, janelaMs: number): Promise<boolean> {
  const desde = new Date(Date.now() - janelaMs);
  const usados = await db.limiteTaxa.count({ where: { chave, criadoEm: { gte: desde } } });
  if (usados >= limite) return false;
  await db.limiteTaxa.create({ data: { chave } });
  return true;
}

export async function zerarLimite(chave: string): Promise<void> {
  await db.limiteTaxa.deleteMany({ where: { chave } });
}

export async function limparLimitesAntigos(): Promise<void> {
  await db.limiteTaxa.deleteMany({ where: { criadoEm: { lt: new Date(Date.now() - 24 * 3600_000) } } });
}
