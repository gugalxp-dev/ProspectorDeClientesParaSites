// Consultas e alterações do CRM.

import type { Prisma } from "@/generated/prisma/client";
import { auditar } from "@/lib/auditoria";
import { db } from "../db";
import { emitir } from "../eventos";
import { registrarOptOut } from "../whatsapp/conversas";
import { garantirEtapas } from "./etapas";

export interface FiltrosLead {
  texto?: string;
  cidade?: string;
  segmento?: string;
  presenca?: string;
  qualificacao?: string;
  scoreMin?: number;
  buscaId?: string;
  /** Mostra também os de baixo potencial (desqualificados). Padrão: escondidos. */
  incluirBaixo?: boolean;
}

export function whereLeads(f: FiltrosLead): Prisma.LeadWhereInput {
  const e: Prisma.LeadWhereInput[] = [];
  if (f.texto) e.push({ OR: [{ nome: { contains: f.texto } }, { endereco: { contains: f.texto } }, { telefone: { contains: f.texto } }] });
  if (f.cidade) e.push({ cidade: { contains: f.cidade } });
  if (f.segmento) e.push({ OR: [{ segmento: { contains: f.segmento } }, { categoria: { contains: f.segmento } }] });
  if (f.presenca) e.push({ presenca: f.presenca });
  if (f.qualificacao) e.push({ qualificacaoStatus: f.qualificacao });
  if (f.scoreMin != null) e.push({ score: { gte: f.scoreMin } });
  if (f.buscaId) e.push({ buscas: { some: { buscaId: f.buscaId } } });
  if (!f.incluirBaixo) e.push({ qualificacaoStatus: { notIn: ["desqualificado", "descartado"] } });
  return { AND: e };
}

export const CAMPOS_CARTAO = {
  id: true,
  nome: true,
  segmento: true,
  categoria: true,
  cidade: true,
  telefone: true,
  telefoneE164: true,
  website: true,
  presenca: true,
  score: true,
  pontuacaoRegra: true,
  qualificacaoStatus: true,
  contatoStatus: true,
  etapaId: true,
  responsavelId: true,
  criadoEm: true,
  ultimaInteracaoEm: true,
  automacaoPausada: true,
  revisao: true,
} satisfies Prisma.LeadSelect;

export async function quadroKanban(f: FiltrosLead, porColuna = 60) {
  await garantirEtapas();
  const etapas = await db.etapaCrm.findMany({ orderBy: { ordem: "asc" } });
  const where = whereLeads(f);
  const colunas = await Promise.all(
    etapas.map(async (e) => {
      const w = { AND: [where, { etapaId: e.id }] };
      const [total, leads] = await Promise.all([
        db.lead.count({ where: w }),
        db.lead.findMany({ where: w, select: CAMPOS_CARTAO, orderBy: [{ score: "desc" }, { pontuacaoRegra: "desc" }], take: porColuna }),
      ]);
      return { etapa: e, total, leads };
    }),
  );
  return colunas;
}

export class ConflitoEdicao extends Error {}

/** Move com concorrência otimista: se outra aba mudou o lead, responde conflito em vez de sobrescrever. */
export async function moverLead(id: string, etapaId: string, revisao: number, usuarioId: string) {
  const etapa = await db.etapaCrm.findUniqueOrThrow({ where: { id: etapaId } });
  const r = await db.lead.updateMany({ where: { id, revisao }, data: { etapaId, revisao: { increment: 1 } } });
  if (r.count === 0) {
    if (!(await db.lead.findUnique({ where: { id }, select: { id: true } }))) throw new Error("Lead não encontrado.");
    throw new ConflitoEdicao("O lead foi alterado em outra tela. Atualize e tente de novo.");
  }
  await db.interacaoLead.create({ data: { leadId: id, tipo: "etapa", descricao: `Movido para "${etapa.nome}".`, usuarioId } });
  await emitir("lead.atualizado", { id });
  return db.lead.findUniqueOrThrow({ where: { id }, select: CAMPOS_CARTAO });
}

export async function atualizarLead(id: string, d: { notas?: string | null; responsavelId?: string | null }, usuarioId: string) {
  const l = await db.lead.update({
    where: { id },
    data: { ...d, revisao: { increment: 1 } },
  });
  if (d.notas !== undefined) await db.interacaoLead.create({ data: { leadId: id, tipo: "nota", descricao: "Observações internas atualizadas.", usuarioId } });
  await emitir("lead.atualizado", { id });
  return l;
}

export async function obterLeadCompleto(id: string) {
  const l = await db.lead.findUnique({
    where: { id },
    include: {
      etapa: true,
      origens: { orderBy: { coletadoEm: "desc" } },
      dados: { orderBy: [{ campo: "asc" }, { coletadoEm: "desc" }] },
      interacoes: { orderBy: { criadoEm: "desc" }, take: 100 },
      consentimentos: { orderBy: { criadoEm: "desc" } },
      buscas: { include: { busca: { select: { id: true, nicho: true, cidade: true, criadoEm: true } } } },
      conversa: { include: { mensagens: { orderBy: { criadoEm: "asc" }, take: 500 } } },
    },
  });
  if (!l) return null;
  const responsavel = l.responsavelId ? await db.usuario.findUnique({ where: { id: l.responsavelId }, select: { id: true, nome: true } }) : null;
  const custo = await db.registroCusto.aggregate({ _sum: { custoUsd: true }, where: { OR: [{ leadId: id }, ...(l.conversa ? [{ conversaId: l.conversa.id }] : [])] } });
  return { ...l, responsavel, custoUsd: custo._sum.custoUsd ?? 0 };
}

/**
 * LGPD: apaga os dados do lead (inclusive conversas). O número vai para a lista de supressão (só o HMAC),
 * para que o contato nunca volte a receber mensagens mesmo que seja descoberto de novo.
 */
export async function excluirDadosPessoais(id: string, usuarioId: string, motivo: string): Promise<void> {
  const l = await db.lead.findUniqueOrThrow({ where: { id } });
  if (l.telefoneE164 || l.whatsappE164) await registrarOptOut({ leadId: id }, `Exclusão de dados (LGPD): ${motivo}`, usuarioId);
  await db.conversa.deleteMany({ where: { leadId: id } });
  await db.registroCusto.updateMany({ where: { leadId: id }, data: { leadId: null } });
  await db.lead.delete({ where: { id } });
  await auditar(usuarioId, "dados_excluidos", id, { motivo, nome: l.nome });
  await emitir("lead.atualizado", { id, removido: true });
}
