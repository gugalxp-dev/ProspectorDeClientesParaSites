// Tudo que depende de uma pessoa para andar: aprovar primeiro contato, assumir negociações transferidas
// e resolver alertas do sistema (WhatsApp desconectado, IA simulada, envios com falha).

import { db } from "./db";
import { provedorAtivo } from "./ia/servico";
import { estadoBaileys, modoWhatsApp } from "./whatsapp/cliente";
import type { Prisma } from "@/generated/prisma/client";

/** Qualificado, com WhatsApp provável, sem opt-out e ainda sem conversa: espera você aprovar o primeiro contato. */
const AGUARDANDO_APROVACAO: Prisma.LeadWhereInput = {
  qualificacaoStatus: "qualificado",
  etapa: { chave: { in: ["qualificado", "aguardando_autorizacao"] } },
  naoContatar: false,
  contatoStatus: { not: "opt_out" },
  conversa: { is: null },
  OR: [{ whatsappE164: { not: null } }, { ehCelular: true }],
};

const EM_INTERVENCAO: Prisma.LeadWhereInput = { etapa: { chave: "intervencao_humana" } };
/** Contrato em andamento ou aceito: não precisa gerar outro. */
const COM_CONTRATO: Prisma.LeadWhereInput = { contratos: { some: { status: { in: ["pronto", "enviado", "visualizado", "aceito"] } } } };

/**
 * Transferências separadas em duas filas: o cliente aceitou (gerar contrato) e as demais (assumir conversa).
 * "Aceitou" = a transferência veio com intenção de aceite (notificação tipo "aceite") e ainda não há contrato.
 */
async function filtrosIntervencao(): Promise<{ gerarContrato: Prisma.LeadWhereInput; outras: Prisma.LeadWhereInput }> {
  const aceites = await db.notificacao.findMany({ where: { tipo: "aceite", leadId: { not: null } }, select: { leadId: true }, distinct: ["leadId"] });
  const ids = aceites.map((a) => a.leadId!);
  const gerarContrato: Prisma.LeadWhereInput = { AND: [EM_INTERVENCAO, { id: { in: ids } }, { NOT: COM_CONTRATO }] };
  // Com contrato já enviado, a bola está com o cliente (aceitar no link): não fica como pendência sua.
  return { gerarContrato, outras: { AND: [EM_INTERVENCAO, { NOT: gerarContrato }, { NOT: COM_CONTRATO }] } };
}

export interface Alerta {
  nivel: "erro" | "aviso";
  texto: string;
  href: string;
}

async function alertas(): Promise<Alerta[]> {
  const lista: Alerta[] = [];
  const [wa, ia, falhas] = await Promise.all([
    modoWhatsApp(),
    provedorAtivo(),
    db.mensagem.count({ where: { direcao: "saida", status: "falhou", criadoEm: { gte: new Date(Date.now() - 24 * 3600_000) } } }),
  ]);
  if (wa === "mock") lista.push({ nivel: "aviso", texto: "WhatsApp em modo simulado: nenhuma mensagem sai do computador.", href: "/admin/integracoes" });
  if (wa === "baileys") {
    const e = await estadoBaileys().catch((err: Error) => ({ conectado: false, detalhe: err.message }));
    if (!e.conectado) lista.push({ nivel: "erro", texto: `WhatsApp desconectado: ${e.detalhe}`, href: "/admin/whatsapp" });
  }
  if (ia.nome === "mock") lista.push({ nivel: "aviso", texto: "IA em modo simulado: o agente não responde de verdade.", href: "/admin/integracoes" });
  if (falhas) lista.push({ nivel: "erro", texto: `${falhas} mensagem(ns) com falha de envio nas últimas 24 h.`, href: "/admin/whatsapp" });
  return lista;
}

export async function contarPendencias() {
  const f = await filtrosIntervencao();
  const [aprovar, contratos, intervencao, al] = await Promise.all([
    db.lead.count({ where: AGUARDANDO_APROVACAO }),
    db.lead.count({ where: f.gerarContrato }),
    db.lead.count({ where: f.outras }),
    alertas(),
  ]);
  return { aprovar, contratos, intervencao, alertas: al.length, total: aprovar + contratos + intervencao + al.length };
}

export async function listarPendencias() {
  const campos = { id: true, nome: true, cidade: true, segmento: true, score: true, presenca: true, revisao: true, whatsappE164: true, telefoneE164: true } as const;
  const f = await filtrosIntervencao();
  const [aprovar, contratos, intervencao, al, perdido] = await Promise.all([
    db.lead.findMany({ where: AGUARDANDO_APROVACAO, select: campos, orderBy: [{ score: "desc" }, { criadoEm: "asc" }], take: 200 }),
    db.lead.findMany({ where: f.gerarContrato, select: { ...campos, motivoTransferencia: true, transferidoEm: true }, orderBy: { transferidoEm: "asc" } }),
    db.lead.findMany({ where: f.outras, select: { ...campos, motivoTransferencia: true, transferidoEm: true }, orderBy: { transferidoEm: "asc" } }),
    alertas(),
    db.etapaCrm.findUnique({ where: { chave: "perdido" }, select: { id: true } }),
  ]);
  return { aprovar, contratos, intervencao, alertas: al, etapaPerdidoId: perdido?.id ?? null };
}
