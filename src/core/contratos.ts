// Contratos a partir de um MODELO ÚNICO (Admin > Contrato). Sem IA: só os dados essenciais mudam por cliente.
// Fluxo: rascunho (editável, com prévia) -> pronto (texto congelado + link público) -> enviado (WhatsApp)
//        -> visualizado (cliente abriu) -> aceito (aceite eletrônico com nome, documento, IP e data) | cancelado.

import { createHash } from "node:crypto";
import { z } from "zod";
import { auditar } from "@/lib/auditoria";
import { cifrar, decifrar, hashSecret, randomToken } from "@/lib/crypto";
import { env } from "@/lib/env";
import { obterConfig, type ConfigDe } from "./config";
import { idEtapa } from "./crm/etapas";
import { db } from "./db";
import { emitir } from "./eventos";
import { enviarMensagem, obterConversa } from "./whatsapp/conversas";

export const esquemaDadosContrato = z.object({
  contratanteNome: z.string().trim().max(200).default(""),
  contratanteDocumento: z.string().trim().max(30).default(""),
  contratanteEndereco: z.string().trim().max(300).default(""),
  contratanteEmail: z.string().trim().max(200).default(""),
  contratanteTelefone: z.string().trim().max(30).default(""),
  servico: z.string().trim().max(200).default(""),
  descricaoServico: z.string().trim().max(3000).default(""),
  valorCentavos: z.number().int().min(0).max(100_000_000).default(0),
  formaPagamento: z.string().trim().max(500).default("50% na assinatura e 50% na entrega, via Pix"),
  prazoDias: z.number().int().min(1).max(365).default(30),
  observacoes: z.string().trim().max(2000).default(""),
});
export type DadosContrato = z.infer<typeof esquemaDadosContrato>;

export class ErroContrato extends Error {}

export const VARIAVEIS = [
  "numero", "data", "contratada_nome", "contratada_documento", "contratada_endereco", "contratada_email", "cidade_contratada", "foro",
  "contratante_nome", "contratante_documento", "contratante_endereco", "contratante_email", "contratante_telefone",
  "servico", "descricao_servico", "valor", "forma_pagamento", "prazo_dias", "observacoes",
] as const;

export const reais = (centavos: number) => (centavos / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** Preenche o modelo. Variável vazia vira "____" para ficar visível na prévia. */
export function renderizar(modelo: string, numero: string, d: DadosContrato, cfg: ConfigDe<"contrato">, data = new Date()): string {
  const v: Record<(typeof VARIAVEIS)[number], string> = {
    numero,
    data: data.toLocaleDateString("pt-BR", { day: "numeric", month: "long", year: "numeric" }),
    contratada_nome: cfg.contratadaNome,
    contratada_documento: cfg.contratadaDocumento,
    contratada_endereco: cfg.contratadaEndereco,
    contratada_email: cfg.contratadaEmail,
    cidade_contratada: cfg.cidade,
    foro: cfg.foro || cfg.cidade,
    contratante_nome: d.contratanteNome,
    contratante_documento: d.contratanteDocumento,
    contratante_endereco: d.contratanteEndereco,
    contratante_email: d.contratanteEmail || "não informado",
    contratante_telefone: d.contratanteTelefone,
    servico: d.servico,
    descricao_servico: d.descricaoServico,
    valor: d.valorCentavos ? reais(d.valorCentavos) : "",
    forma_pagamento: d.formaPagamento,
    prazo_dias: String(d.prazoDias),
    observacoes: d.observacoes || "Sem observações adicionais.",
  };
  return modelo.replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (todo, chave: string) => (chave in v ? v[chave as keyof typeof v] || "____" : todo));
}

/** O que falta para poder finalizar. */
export function pendenciasContrato(d: DadosContrato, cfg: ConfigDe<"contrato">): string[] {
  const p: string[] = [];
  if (!cfg.contratadaNome || !cfg.contratadaDocumento) p.push("Dados da sua empresa em Admin > Contrato");
  if (!d.contratanteNome) p.push("Nome do contratante");
  const doc = d.contratanteDocumento.replace(/\D/g, "");
  if (doc.length !== 11 && doc.length !== 14) p.push("CPF (11 dígitos) ou CNPJ (14 dígitos) do contratante");
  if (!d.servico) p.push("Serviço");
  if (!d.valorCentavos) p.push("Valor");
  return p;
}

async function proximoNumero(): Promise<string> {
  const ano = new Date().getFullYear();
  const n = await db.contrato.count({ where: { numero: { startsWith: `${ano}-` } } });
  return `${ano}-${String(n + 1).padStart(4, "0")}`;
}

export function linkPublico(tokenCifrado: string | null, origem?: string): string | null {
  if (!tokenCifrado) return null;
  const base = (env().APP_URL ?? origem ?? "http://localhost:3000").replace(/\/$/, "");
  return `${base}/contrato/${decifrar(tokenCifrado)}`;
}

/** Dados iniciais tirados do lead (o resto você completa no painel). */
export async function dadosIniciais(leadId: string): Promise<DadosContrato> {
  const l = await db.lead.findUniqueOrThrow({ where: { id: leadId } });
  const servico = await db.servico.findFirst({ where: { ativo: true }, orderBy: { ordem: "asc" } });
  return esquemaDadosContrato.parse({
    contratanteNome: l.nome,
    contratanteEndereco: [l.endereco, l.cidade, l.uf].filter(Boolean).join(", "),
    contratanteEmail: l.emails?.split(",")[0]?.trim() ?? "",
    contratanteTelefone: l.whatsappE164 ?? l.telefoneE164 ?? "",
    ...(servico ? { servico: servico.nome, descricaoServico: servico.descricao, valorCentavos: servico.precoCentavos, prazoDias: servico.prazoDias } : {}),
  });
}

/** Cria ou atualiza o rascunho do lead (um rascunho por vez). */
export async function salvarRascunho(leadId: string, dados: DadosContrato, usuarioId: string) {
  const atual = await db.contrato.findFirst({ where: { leadId, status: "rascunho" } });
  if (atual) return db.contrato.update({ where: { id: atual.id }, data: { dados: JSON.stringify(dados) } });
  const c = await db.contrato.create({ data: { leadId, numero: await proximoNumero(), dados: JSON.stringify(dados), criadoPorId: usuarioId } });
  await auditar(usuarioId, "contrato_criado", leadId, { numero: c.numero });
  return c;
}

/** Congela o texto e cria o link público. Depois disso o contrato não muda mais (para mudar: cancelar e gerar outro). */
export async function finalizar(contratoId: string, usuarioId: string) {
  const [c, cfg] = await Promise.all([db.contrato.findUniqueOrThrow({ where: { id: contratoId } }), obterConfig("contrato")]);
  if (c.status !== "rascunho") return c;
  const dados = esquemaDadosContrato.parse(JSON.parse(c.dados));
  const falta = pendenciasContrato(dados, cfg);
  if (falta.length) throw new ErroContrato(`Falta preencher: ${falta.join(", ")}.`);
  const conteudo = renderizar(cfg.modelo, c.numero, dados, cfg);
  const token = randomToken(24);
  const r = await db.contrato.update({
    where: { id: c.id },
    data: {
      status: "pronto",
      conteudo,
      conteudoHash: createHash("sha256").update(conteudo).digest("hex"),
      tokenHash: hashSecret(`contrato:${token}`),
      tokenCifrado: cifrar(token),
      finalizadoEm: new Date(),
    },
  });
  await auditar(usuarioId, "contrato_finalizado", c.leadId, { numero: c.numero });
  return r;
}

/** Manda o link pelo WhatsApp (mesmas regras de qualquer envio: opt-out, limites, janela de 24 h na API oficial). */
export async function enviarPorWhatsApp(contratoId: string, usuarioId: string, origem?: string) {
  const [c, cfg] = await Promise.all([db.contrato.findUniqueOrThrow({ where: { id: contratoId }, include: { lead: true } }), obterConfig("contrato")]);
  if (!["pronto", "enviado", "visualizado"].includes(c.status)) throw new ErroContrato("Finalize o contrato antes de enviar.");
  const tel = c.lead.whatsappE164 ?? (c.lead.ehCelular ? c.lead.telefoneE164 : null);
  if (!tel) throw new ErroContrato("O lead não tem WhatsApp. Copie o link e envie por outro canal.");
  const dados = esquemaDadosContrato.parse(JSON.parse(c.dados));
  const link = linkPublico(c.tokenCifrado, origem)!;
  const texto = cfg.mensagemEnvio
    .replaceAll("{{nome}}", dados.contratanteNome.split(" ")[0] || dados.contratanteNome)
    .replaceAll("{{numero}}", c.numero)
    .replaceAll("{{link}}", link);
  const conversa = await obterConversa(tel, c.leadId);
  await enviarMensagem({ conversaId: conversa.id, autor: "humano", usuarioId, texto });
  const r = await db.contrato.update({ where: { id: c.id }, data: { status: c.status === "pronto" ? "enviado" : c.status, enviadoEm: new Date() } });
  await db.interacaoLead.create({ data: { leadId: c.leadId, tipo: "contrato", descricao: `Contrato nº ${c.numero} enviado pelo WhatsApp.`, usuarioId } });
  return r;
}

export async function cancelar(contratoId: string, usuarioId: string) {
  const c = await db.contrato.findUniqueOrThrow({ where: { id: contratoId } });
  if (c.status === "aceito") throw new ErroContrato("Contrato já aceito pelo cliente não pode ser cancelado por aqui.");
  await db.contrato.update({ where: { id: c.id }, data: { status: "cancelado", canceladoEm: new Date(), tokenHash: null } });
  await auditar(usuarioId, "contrato_cancelado", c.leadId, { numero: c.numero });
}

// ───────────── Página pública (cliente) ─────────────

export async function contratoPorToken(token: string) {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return null;
  return db.contrato.findUnique({ where: { tokenHash: hashSecret(`contrato:${token}`) } });
}

/** Primeira abertura do link pelo cliente. */
export async function marcarVisualizado(id: string) {
  const r = await db.contrato.updateMany({ where: { id, visualizadoEm: null }, data: { visualizadoEm: new Date() } });
  if (r.count) {
    await db.contrato.updateMany({ where: { id, status: { in: ["pronto", "enviado"] } }, data: { status: "visualizado" } });
    const c = await db.contrato.findUniqueOrThrow({ where: { id } });
    await db.interacaoLead.create({ data: { leadId: c.leadId, tipo: "contrato", descricao: `Cliente abriu o contrato nº ${c.numero}.` } });
    await emitir("lead.atualizado", { id: c.leadId });
  }
}

export async function aceitar(token: string, aceite: { nome: string; documento: string; ip: string; navegador: string }) {
  const c = await contratoPorToken(token);
  if (!c || c.status === "cancelado" || c.status === "rascunho") throw new ErroContrato("Contrato não encontrado ou cancelado.");
  if (c.status === "aceito") return c;
  const r = await db.contrato.update({
    where: { id: c.id },
    data: { status: "aceito", aceitoEm: new Date(), aceiteNome: aceite.nome, aceiteDocumento: aceite.documento, aceiteIp: aceite.ip, aceiteNavegador: aceite.navegador.slice(0, 300) },
  });
  // Negócio fechado: move o lead e avisa no painel.
  await db.lead.update({ where: { id: c.leadId }, data: { etapaId: await idEtapa("fechado"), revisao: { increment: 1 } } });
  await db.interacaoLead.create({ data: { leadId: c.leadId, tipo: "contrato", descricao: `Contrato nº ${c.numero} ACEITO por ${aceite.nome} (${aceite.documento}).` } });
  const lead = await db.lead.findUnique({ where: { id: c.leadId }, select: { nome: true } });
  const n = await db.notificacao.create({
    data: { tipo: "contrato_aceito", titulo: `Contrato aceito: ${lead?.nome ?? c.numero}`, mensagem: `Contrato nº ${c.numero} aceito por ${aceite.nome}.`, leadId: c.leadId },
  });
  await auditar(null, "contrato_aceito", c.leadId, { numero: c.numero, ip: aceite.ip });
  await emitir("notificacao.nova", { id: n.id, leadId: c.leadId });
  await emitir("lead.atualizado", { id: c.leadId });
  return r;
}
