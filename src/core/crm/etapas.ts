// Etapas do CRM (colunas do Kanban). Configuráveis no painel; as de sistema não podem ser apagadas.

import { db } from "../db";
import { ETAPAS_PADRAO, type ChaveEtapa } from "../tipos";

let garantidas: Promise<void> | null = null;

export function garantirEtapas(): Promise<void> {
  garantidas ??= (async () => {
    const existentes = await db.etapaCrm.findMany({ select: { chave: true } });
    const faltando = ETAPAS_PADRAO.filter((e) => !existentes.some((x) => x.chave === e.chave));
    for (const e of faltando) {
      await db.etapaCrm
        .create({ data: { chave: e.chave, nome: e.nome, cor: e.cor, ordem: ETAPAS_PADRAO.indexOf(e), sistema: true } })
        .catch(() => undefined); // outro processo criou ao mesmo tempo
    }
  })().catch((e) => {
    garantidas = null;
    throw e;
  });
  return garantidas;
}

const cache = new Map<string, string>();

export async function idEtapa(chave: ChaveEtapa): Promise<string> {
  const c = cache.get(chave);
  if (c) return c;
  await garantirEtapas();
  const e = await db.etapaCrm.findUniqueOrThrow({ where: { chave } });
  cache.set(chave, e.id);
  return e.id;
}

export async function listarEtapas() {
  await garantirEtapas();
  return db.etapaCrm.findMany({ orderBy: { ordem: "asc" } });
}

/** Etapas em que a automação ainda pode mover o lead sozinha (o usuário não mexeu nele). */
export const ETAPAS_AUTOMATICAS: ChaveEtapa[] = ["novo", "em_analise", "qualificado"];

export async function moverSeAutomatica(leadId: string, para: ChaveEtapa): Promise<boolean> {
  const permitidas = await Promise.all(ETAPAS_AUTOMATICAS.map(idEtapa));
  const destino = await idEtapa(para);
  const r = await db.lead.updateMany({
    where: { id: leadId, OR: [{ etapaId: null }, { etapaId: { in: permitidas } }], NOT: { etapaId: destino } },
    data: { etapaId: destino, revisao: { increment: 1 } },
  });
  return r.count > 0;
}
