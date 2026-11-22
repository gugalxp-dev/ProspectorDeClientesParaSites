// Ciclo de vida de uma pesquisa (segmento + cidade). Tudo roda no worker, nunca dentro da requisição HTTP:
//   1. criarBusca: valida, grava e enfileira a descoberta
//   2. job busca_descobrir (um por fonte): geocodifica, consulta a fonte, importa com deduplicação
//   3. job lead_processar (um por empresa): crawler + scraper + avaliação do site
//   4. job lead_qualificar: análise por IA e score
//   5. atualizarProgresso: recalcula indicadores e conclui quando não sobra trabalho
// Várias pesquisas rodam ao mesmo tempo; cada uma tem seus resultados, as empresas são globais.

import { obterConfig } from "./config";
import { db } from "./db";
import { emitir, registrarLog } from "./eventos";
import { cancelarJobsDaBusca, enfileirar, ErroDefinitivo } from "./fila";
import { fonte } from "./fontes";
import { FonteIndisponivel } from "./fontes/tipos";
import { geocodificar } from "./geocode";
import { intocado } from "./prospeccao/filtro";
import { importarLugares } from "./prospeccao/importar";
import type { StatusBusca } from "./tipos";

export async function criarBusca(dados: { nicho: string; cidade: string; fontes?: string[] }, usuarioId: string | null) {
  const cfg = await obterConfig("prospeccao");
  const ativas = Object.entries(cfg.fontes)
    .filter(([, v]) => v.ativa)
    .map(([id]) => id);
  const fontes = (dados.fontes?.length ? dados.fontes.filter((f) => ativas.includes(f)) : ativas).filter((f) => fonte(f));
  if (!fontes.length) throw new Error("Nenhuma fonte de descoberta ativa. Ative uma em Admin > Prospecção.");
  const igual = await pesquisaIgual(dados.nicho, dados.cidade);
  if (igual) throw new PesquisaDuplicada(igual);

  const busca = await db.busca.create({
    data: { nicho: dados.nicho.trim(), cidade: dados.cidade.trim(), fontes: JSON.stringify(fontes), criadoPorId: usuarioId },
  });
  for (const f of fontes) {
    await enfileirar("busca_descobrir", { buscaId: busca.id, fonte: f }, { chave: `descobrir:${busca.id}:${f}`, buscaId: busca.id, maxTentativas: 4 });
  }
  await emitir("busca.atualizada", { id: busca.id });
  return busca;
}

/** Job: descoberta numa fonte. */
export async function descobrir(buscaId: string, fonteId: string): Promise<void> {
  const busca = await db.busca.findUnique({ where: { id: buscaId } });
  if (!busca || busca.status === "cancelada") return;
  const f = fonte(fonteId);
  if (!f) throw new Error(`Fonte desconhecida: ${fonteId}`);
  const cfg = await obterConfig("prospeccao");

  await db.busca.update({ where: { id: buscaId }, data: { status: "descobrindo", iniciadoEm: busca.iniciadoEm ?? new Date() } });
  await emitir("busca.atualizada", { id: buscaId });

  const disponivel = await f.disponivel();
  if (!disponivel.ok) throw new FonteIndisponivel(`${f.nome}: ${disponivel.motivo}`);

  const local = await geocodificar(`${busca.cidade}, Brasil`);
  if (!local) throw new ErroDefinitivo(`Cidade não encontrada: "${busca.cidade}". Tente "Cidade, UF".`);
  if (busca.lat == null) {
    await db.busca.update({ where: { id: buscaId }, data: { lat: local.lat, lon: local.lon, bbox: JSON.stringify(local.bbox) } });
  }

  const lugares = await f.descobrir({ nicho: busca.nicho, cidade: busca.cidade.split(",")[0].trim(), local, max: cfg.maxEmpresasPorBusca, buscaId });
  const r = await importarLugares(buscaId, busca.nicho, busca.cidade.split(",")[0].trim(), lugares.slice(0, cfg.maxEmpresasPorBusca));
  await db.busca.update({ where: { id: buscaId }, data: { novas: { increment: r.novos }, status: "processando" } });
  await registrarLog("info", "descoberta", `${f.nome}: ${r.recebidos} recebidas, ${r.importados} importadas (${r.novos} novas, ${r.ignorados} ignoradas).`, { buscaId });

  for (const leadId of r.leadIds) {
    await enfileirar("lead_processar", { leadId, buscaId }, { chave: `processar:${leadId}:${buscaId}`, buscaId, maxTentativas: 2 });
  }
  if (r.novos) await emitir("lead.novo", { buscaId, quantidade: r.novos });
}

export async function cancelarBusca(id: string): Promise<void> {
  await cancelarJobsDaBusca(id);
  await db.busca.update({ where: { id }, data: { status: "cancelada", concluidoEm: new Date() } });
  await emitir("busca.atualizada", { id });
}

/**
 * Refaz a pesquisa DO ZERO (mesmo segmento e cidade) com as regras e fontes atuais.
 * Apaga as empresas que eram só desta pesquisa e ainda não foram contatadas, desliga as demais
 * (em conversa, com contrato ou de outra pesquisa: ficam no CRM e voltam a ser ligadas se achadas de novo),
 * zera andamento, contadores e log, e busca de novo. O histórico de gastos é mantido.
 */
export async function refazerBusca(id: string): Promise<{ empresasApagadas: number }> {
  const b = await db.busca.findUniqueOrThrow({ where: { id } });
  const cfg = await obterConfig("prospeccao");
  const fontes = Object.entries(cfg.fontes)
    .filter(([fid, v]) => v.ativa && fonte(fid))
    .map(([fid]) => fid);
  if (!fontes.length) throw new Error("Nenhuma fonte de descoberta ativa. Ative uma em Admin > Prospecção.");
  await cancelarJobsDaBusca(id);
  const apagar = await leadsSoDestaBusca(id);
  await db.registroCusto.updateMany({ where: { OR: [{ buscaId: id }, { leadId: { in: apagar } }] }, data: { buscaId: null, leadId: null } });
  await db.lead.deleteMany({ where: { id: { in: apagar } } });
  await db.buscaLead.deleteMany({ where: { buscaId: id } });
  await db.job.deleteMany({ where: { buscaId: id } });
  await db.logOperacao.deleteMany({ where: { buscaId: id } });
  await db.busca.update({
    where: { id },
    data: { status: "pendente", erro: null, encontradas: 0, novas: 0, iniciadoEm: null, concluidoEm: null, fontes: JSON.stringify(fontes) },
  });
  const vez = Date.now();
  for (const f of fontes) {
    await enfileirar("busca_descobrir", { buscaId: id, fonte: f }, { chave: `descobrir:${id}:${f}:${vez}`, buscaId: id, maxTentativas: 4 });
  }
  await registrarLog("info", "descoberta", `Pesquisa refeita do zero: ${b.nicho} em ${b.cidade} (${apagar.length} empresa(s) anteriores removidas).`, { buscaId: id });
  await emitir("busca.atualizada", { id });
  await emitir("lead.atualizado", { removidos: apagar.length });
  return { empresasApagadas: apagar.length };
}

/** "Salões de beleza" e "salao de beleza " são a mesma pesquisa: compara sem acento, caixa e espaços extras. */
export function chavePesquisa(nicho: string, cidade: string): string {
  const n = (t: string) =>
    t
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  return `${n(nicho)}|${n(cidade)}`;
}

/** Pesquisa já existente com o mesmo segmento e cidade (cada pesquisa é única: para repetir, use Refazer). */
export async function pesquisaIgual(nicho: string, cidade: string): Promise<{ id: string; nicho: string; cidade: string } | null> {
  const chave = chavePesquisa(nicho, cidade);
  const todas = await db.busca.findMany({ select: { id: true, nicho: true, cidade: true } });
  return todas.find((b) => chavePesquisa(b.nicho, b.cidade) === chave) ?? null;
}

export class PesquisaDuplicada extends Error {
  constructor(public existente: { id: string; nicho: string; cidade: string }) {
    super(`Já existe a pesquisa "${existente.nicho} — ${existente.cidade}". Para buscar de novo, use "Refazer" nela.`);
  }
}

/** Empresas que sairiam junto: só desta pesquisa e ainda não contatadas (ninguém mexeu nelas). */
async function leadsSoDestaBusca(id: string): Promise<string[]> {
  const ligados = await db.buscaLead.findMany({
    where: { buscaId: id },
    select: { lead: { select: { id: true, contatoStatus: true, etapaId: true, conversa: { select: { id: true } }, contratos: { select: { id: true } }, _count: { select: { buscas: true } } } } },
  });
  const ids: string[] = [];
  for (const { lead } of ligados) {
    if (lead._count.buscas === 1 && lead.contratos.length === 0 && (await intocado(lead))) ids.push(lead.id);
  }
  return ids;
}

export async function previaExclusao(id: string): Promise<{ empresas: number }> {
  return { empresas: (await leadsSoDestaBusca(id)).length };
}

/**
 * Exclui a pesquisa e as empresas encontradas só por ela que ainda não foram contatadas.
 * Ficam: empresas em negociação/contatadas/com contrato, as que outra pesquisa também achou e o histórico de gastos.
 */
export async function excluirBusca(id: string): Promise<{ empresasApagadas: number }> {
  await cancelarJobsDaBusca(id);
  const ids = await leadsSoDestaBusca(id);
  await db.registroCusto.updateMany({ where: { OR: [{ buscaId: id }, { leadId: { in: ids } }] }, data: { buscaId: null, leadId: null } });
  await db.lead.deleteMany({ where: { id: { in: ids } } });
  await db.job.deleteMany({ where: { buscaId: id } });
  await db.logOperacao.deleteMany({ where: { buscaId: id } });
  await db.busca.delete({ where: { id } });
  await emitir("busca.atualizada", { id, removida: true });
  await emitir("lead.atualizado", { removidos: ids.length });
  return { empresasApagadas: ids.length };
}

export interface ResumoBusca {
  id: string;
  nicho: string;
  cidade: string;
  fontes: string[];
  status: StatusBusca;
  erro: string | null;
  criadoEm: Date;
  concluidoEm: Date | null;
  encontradas: number;
  novas: number;
  analisadas: number;
  qualificadas: number;
  descartadas: number;
  erros: number;
  progresso: number;
  jobs: { total: number; pendentes: number; rodando: number; ok: number; falhou: number };
  custoUsd: number;
}

export async function resumoBusca(id: string): Promise<ResumoBusca | null> {
  const b = await db.busca.findUnique({ where: { id } });
  if (!b) return null;
  const [encontradas, analisadas, qualificadas, descartadas, erros, jobs, custo] = await Promise.all([
    db.buscaLead.count({ where: { buscaId: id } }),
    db.buscaLead.count({ where: { buscaId: id, lead: { qualificacaoStatus: { in: ["qualificado", "desqualificado", "erro", "descartado"] } } } }),
    db.buscaLead.count({ where: { buscaId: id, lead: { qualificacaoStatus: "qualificado" } } }),
    db.logOperacao.count({ where: { buscaId: id, etapa: "filtro" } }),
    db.logOperacao.count({ where: { buscaId: id, nivel: "erro" } }),
    db.job.groupBy({ by: ["status"], where: { buscaId: id }, _count: true }),
    db.registroCusto.aggregate({ _sum: { custoUsd: true }, where: { buscaId: id } }),
  ]);
  const conta = (s: string) => jobs.find((j) => j.status === s)?._count ?? 0;
  const total = jobs.reduce((s, j) => s + j._count, 0);
  const feitos = conta("ok") + conta("falhou") + conta("cancelado");
  return {
    id: b.id,
    nicho: b.nicho,
    cidade: b.cidade,
    fontes: JSON.parse(b.fontes) as string[],
    status: b.status as StatusBusca,
    erro: b.erro,
    criadoEm: b.criadoEm,
    concluidoEm: b.concluidoEm,
    encontradas,
    novas: b.novas,
    analisadas,
    qualificadas,
    descartadas,
    erros,
    progresso: b.status === "concluida" ? 100 : total ? Math.round((feitos / total) * 100) : 0,
    jobs: { total, pendentes: conta("pendente"), rodando: conta("rodando"), ok: conta("ok"), falhou: conta("falhou") },
    custoUsd: custo._sum.custoUsd ?? 0,
  };
}

/** Recalcula contadores e conclui a busca quando não há mais trabalho pendente. */
export async function atualizarProgresso(id: string): Promise<void> {
  const b = await db.busca.findUnique({ where: { id }, select: { status: true } });
  if (!b || ["concluida", "cancelada", "falhou"].includes(b.status)) return;
  const abertos = await db.job.count({ where: { buscaId: id, status: { in: ["pendente", "rodando"] } } });
  const encontradas = await db.buscaLead.count({ where: { buscaId: id } });
  if (abertos === 0) {
    const descobertas = await db.job.findMany({ where: { buscaId: id, tipo: "busca_descobrir" }, select: { status: true, erro: true } });
    const todasFalharam = descobertas.length > 0 && descobertas.every((d) => d.status === "falhou");
    await db.busca.update({
      where: { id },
      data: {
        encontradas,
        status: todasFalharam ? "falhou" : "concluida",
        erro: todasFalharam ? (descobertas[0]?.erro ?? "Todas as fontes falharam.") : null,
        concluidoEm: new Date(),
      },
    });
  } else {
    await db.busca.update({ where: { id }, data: { encontradas } });
  }
  await emitir("busca.atualizada", { id });
}

export async function listarBuscas(limite = 50): Promise<ResumoBusca[]> {
  const buscas = await db.busca.findMany({ orderBy: { criadoEm: "desc" }, take: limite, select: { id: true } });
  return (await Promise.all(buscas.map((b) => resumoBusca(b.id)))).filter((r): r is ResumoBusca => !!r);
}
