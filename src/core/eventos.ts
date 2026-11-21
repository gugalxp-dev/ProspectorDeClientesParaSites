// Eventos de tempo real (SSE). Sempre emitidos DEPOIS que a mudança foi gravada no banco.
// Ficam numa tabela com id crescente: o navegador reconecta com Last-Event-ID e recebe o que perdeu,
// e funciona entre processos (o worker grava, o servidor web transmite).

import { db } from "./db";
import { log, mensagemErro } from "@/lib/log";

export type TipoEvento =
  | "busca.atualizada"
  | "lead.atualizado"
  | "lead.novo"
  | "mensagem.nova"
  | "mensagem.status"
  | "notificacao.nova"
  | "metricas";

export async function emitir(tipo: TipoEvento, payload: Record<string, unknown> = {}): Promise<void> {
  try {
    await db.evento.create({ data: { tipo, payload: JSON.stringify(payload) } });
  } catch (e) {
    // Falha ao emitir não desfaz a operação já gravada; a tela se corrige no próximo snapshot.
    log.aviso("falha ao emitir evento", { tipo, erro: mensagemErro(e) });
  }
}

export async function eventosDesde(id: number, limite = 200) {
  return db.evento.findMany({ where: { id: { gt: id } }, orderBy: { id: "asc" }, take: limite });
}

export async function ultimoEventoId(): Promise<number> {
  const e = await db.evento.findFirst({ orderBy: { id: "desc" }, select: { id: true } });
  return e?.id ?? 0;
}

export async function limparEventosAntigos(horas = 24): Promise<void> {
  await db.evento.deleteMany({ where: { criadoEm: { lt: new Date(Date.now() - horas * 3600_000) } } });
}

export async function registrarLog(
  nivel: "info" | "aviso" | "erro",
  etapa: string,
  mensagem: string,
  ref: { buscaId?: string | null; leadId?: string | null } = {},
): Promise<void> {
  await db.logOperacao.create({
    data: { nivel, etapa, mensagem: mensagem.slice(0, 2000), buscaId: ref.buscaId ?? null, leadId: ref.leadId ?? null },
  });
  (nivel === "erro" ? log.erro : nivel === "aviso" ? log.aviso : log.info)(mensagem, { etapa, ...ref });
}
