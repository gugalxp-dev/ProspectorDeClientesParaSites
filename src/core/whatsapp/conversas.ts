// Conversas, consentimento, opt-out, envio e transferência para humano.
// Regras que valem para QUALQUER envio (agente ou pessoa):
// - telefone público não é autorização: o primeiro contato exige opt-in registrado (origem + base legal)
// - opt-out e números suprimidos bloqueiam tudo, sempre
// - texto livre só dentro da janela de 24 h após a última mensagem do cliente; fora dela, só template aprovado
// - limites diários de envio e de templates
// - depois da transferência, o agente fica parado nesta conversa até alguém autorizar de novo

import { auditar } from "@/lib/auditoria";
import { mensagemErro } from "@/lib/log";
import { obterConfig } from "../config";
import { idEtapa } from "../crm/etapas";
import { db } from "../db";
import { emitir, registrarLog } from "../eventos";
import { enfileirar } from "../fila";
import { hashTelefone } from "../prospeccao/importar";
import { normalizarTelefone } from "../telefone";
import type { ChaveEtapa } from "../tipos";
import { ganchoPrimeiroContato } from "../agente/diagnostico";
import { clienteWhatsApp, ErroWhatsApp, modoWhatsApp } from "./cliente";
import type { EntradaWhatsApp, StatusWhatsApp } from "./webhook";

export const JANELA_MS = 24 * 3600_000;

export class EnvioBloqueado extends Error {}

/** Celular brasileiro pode chegar da Meta sem o nono dígito: gera as duas formas. */
export function variantesTelefone(e164: string): string[] {
  const d = e164.replace(/\D/g, "");
  const v = new Set([`+${d}`]);
  const m = d.match(/^55(\d{2})(9?)(\d{8})$/);
  if (m) {
    v.add(`+55${m[1]}9${m[3]}`);
    v.add(`+55${m[1]}${m[3]}`);
  }
  return [...v];
}

function e164DoWaId(waId: string): string {
  const t = normalizarTelefone(`+${waId}`);
  return t.e164 ?? `+${waId}`;
}

async function moverEtapa(leadId: string, para: ChaveEtapa, motivo: string, usuarioId: string | null = null) {
  const destino = await idEtapa(para);
  // Sem NOT puro: em SQL, NOT (etapaId = x) com etapaId nulo é falso e o lead sem etapa não seria movido.
  const r = await db.lead.updateMany({ where: { id: leadId, OR: [{ etapaId: null }, { etapaId: { not: destino } }] }, data: { etapaId: destino, revisao: { increment: 1 } } });
  if (r.count) await db.interacaoLead.create({ data: { leadId, tipo: "etapa", descricao: motivo, usuarioId } });
}

export async function estaSuprimido(e164: string): Promise<boolean> {
  for (const v of variantesTelefone(e164)) {
    if (await db.supressao.findUnique({ where: { telefoneHash: hashTelefone(v) } })) return true;
  }
  return false;
}

export function dentroDaJanela(ultimaEntradaEm: Date | null, agora = Date.now()): boolean {
  return !!ultimaEntradaEm && agora - ultimaEntradaEm.getTime() < JANELA_MS;
}

function telefoneDoLead(l: { whatsappE164: string | null; telefoneE164: string | null; ehCelular: boolean }): string | null {
  return l.whatsappE164 ?? (l.ehCelular ? l.telefoneE164 : null);
}

// ───────────── Consentimento e opt-out ─────────────

export async function registrarConsentimento(
  leadId: string,
  d: { origem: string; baseLegal: string; evidencia?: string | null; telefone?: string | null },
  registradoPor: string,
): Promise<void> {
  const lead = await db.lead.findUniqueOrThrow({ where: { id: leadId } });
  const tel = d.telefone ? normalizarTelefone(d.telefone).e164 : telefoneDoLead(lead);
  if (!tel) throw new EnvioBloqueado("O lead não tem um celular/WhatsApp válido. Informe o número autorizado.");
  if (lead.naoContatar || (await estaSuprimido(tel))) {
    throw new EnvioBloqueado("Este contato pediu para não receber mensagens (opt-out). O registro não pode ser revertido por aqui.");
  }
  await db.consentimento.create({
    data: { leadId, telefoneE164: tel, tipo: "opt_in", origem: d.origem, baseLegal: d.baseLegal, evidencia: d.evidencia ?? null, registradoPor },
  });
  await db.lead.update({ where: { id: leadId }, data: { contatoStatus: "autorizado", whatsappE164: lead.whatsappE164 ?? tel } });
  await db.interacaoLead.create({ data: { leadId, tipo: "consentimento", descricao: `Autorização de contato registrada (${d.baseLegal}): ${d.origem}`, usuarioId: registradoPor === "cliente" ? null : registradoPor } });
  if (registradoPor !== "cliente") await auditar(registradoPor, "consentimento_registrado", leadId, { origem: d.origem, baseLegal: d.baseLegal });
  await emitir("lead.atualizado", { id: leadId });
}

export async function registrarOptOut(alvo: { leadId?: string | null; telefone?: string | null }, origem: string, por: string | null): Promise<void> {
  const lead = alvo.leadId ? await db.lead.findUnique({ where: { id: alvo.leadId } }) : null;
  const tel = alvo.telefone ?? (lead ? telefoneDoLead(lead) ?? lead.telefoneE164 : null);
  if (tel) {
    for (const v of variantesTelefone(tel)) {
      await db.supressao.upsert({ where: { telefoneHash: hashTelefone(v) }, create: { telefoneHash: hashTelefone(v), motivo: origem }, update: {} });
    }
  }
  if (lead) {
    await db.lead.update({ where: { id: lead.id }, data: { naoContatar: true, contatoStatus: "opt_out", automacaoPausada: true } });
    if (tel) await db.consentimento.create({ data: { leadId: lead.id, telefoneE164: tel, tipo: "opt_out", origem, registradoPor: por ?? "cliente" } });
    await db.interacaoLead.create({ data: { leadId: lead.id, tipo: "opt_out", descricao: `Opt-out: ${origem}`, usuarioId: por } });
    await moverEtapa(lead.id, "perdido", "Movido para Perdido após opt-out.");
    await emitir("lead.atualizado", { id: lead.id });
  }
  const conversa = tel ? await db.conversa.findFirst({ where: { telefoneE164: { in: variantesTelefone(tel) } } }) : null;
  if (conversa) await db.conversa.update({ where: { id: conversa.id }, data: { status: "encerrada", agenteAtivo: false } });
  await auditar(por, "opt_out", lead?.id ?? null, { origem });
}

export function pediuOptOut(texto: string, palavras: string[]): boolean {
  const t = texto.trim().toLowerCase();
  return palavras.some((p) => {
    const w = p.toLowerCase();
    // Palavra curta só vale sozinha ("Parar"), para não pegar "não vou parar de vender".
    return w.split(" ").length === 1 ? new RegExp(`^\\W*${w}\\W*$`, "i").test(t) : t.includes(w);
  });
}

// ───────────── Conversas ─────────────

export async function obterConversa(telefoneE164: string, leadId: string | null) {
  const existente = await db.conversa.findFirst({ where: { telefoneE164: { in: variantesTelefone(telefoneE164) } } });
  if (existente) {
    if (!existente.leadId && leadId) return db.conversa.update({ where: { id: existente.id }, data: { leadId } });
    return existente;
  }
  try {
    return await db.conversa.create({ data: { telefoneE164, leadId } });
  } catch {
    return db.conversa.findFirstOrThrow({ where: { telefoneE164 } });
  }
}

export async function encontrarLeadPorTelefone(e164: string) {
  const v = variantesTelefone(e164);
  return db.lead.findFirst({ where: { OR: [{ whatsappE164: { in: v } }, { telefoneE164: { in: v } }] }, orderBy: { atualizadoEm: "desc" } });
}

async function contarEnviosHoje(filtro: { tipo?: string; conversaId?: string; autor?: string } = {}) {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  return db.mensagem.count({
    where: { direcao: "saida", criadoEm: { gte: hoje }, status: { notIn: ["bloqueada", "falhou"] }, ...filtro },
  });
}

interface PedidoEnvio {
  conversaId: string;
  autor: "agente" | "humano" | "sistema";
  texto?: string;
  /** `texto`: versão em texto livre, usada no modo Baileys (sem templates). */
  template?: { nome: string; idioma: string; parametros: string[]; texto?: string };
  usuarioId?: string | null;
}

/** Envia (ou bloqueia) uma mensagem. Grava antes de chamar a Meta: nada é enviado sem registro. */
export async function enviarMensagem(p: PedidoEnvio) {
  const conversa = await db.conversa.findUniqueOrThrow({ where: { id: p.conversaId }, include: { lead: true } });
  const cfgWa = await obterConfig("whatsapp");
  const lead = conversa.lead;

  const bloquear = async (motivo: string) => {
    await db.mensagem.create({
      data: {
        conversaId: conversa.id,
        direcao: "saida",
        autor: p.autor,
        tipo: p.template ? "template" : "texto",
        conteudo: p.texto ?? `[Template: ${p.template?.nome}]`,
        templateNome: p.template?.nome ?? null,
        status: "bloqueada",
        erro: motivo,
      },
    });
    await registrarLog("aviso", "whatsapp", `Envio bloqueado: ${motivo}`, { leadId: lead?.id });
    throw new EnvioBloqueado(motivo);
  };

  if (lead?.naoContatar || lead?.contatoStatus === "opt_out" || (await estaSuprimido(conversa.telefoneE164))) {
    await bloquear("Contato pediu para não receber mensagens (opt-out).");
  }
  if (conversa.status === "encerrada") await bloquear("Conversa encerrada.");
  // Janela de 24 h é regra da Meta (API oficial e simulador). No Baileys não existe.
  if (!p.template && !dentroDaJanela(conversa.ultimaEntradaEm) && (await modoWhatsApp()) !== "baileys") {
    await bloquear("Fora da janela de 24 h do WhatsApp: só é possível enviar um template aprovado.");
  }
  if (p.template && lead?.contatoStatus !== "autorizado") {
    await bloquear("Sem autorização registrada para iniciar contato com este lead.");
  }
  if (cfgWa.limiteDiarioMensagens > 0 && (await contarEnviosHoje()) >= cfgWa.limiteDiarioMensagens) {
    await bloquear(`Limite diário de mensagens atingido (${cfgWa.limiteDiarioMensagens}).`);
  }
  if (p.template && cfgWa.limiteDiarioTemplates > 0 && (await contarEnviosHoje({ tipo: "template" })) >= cfgWa.limiteDiarioTemplates) {
    await bloquear(`Limite diário de templates atingido (${cfgWa.limiteDiarioTemplates}).`);
  }
  if (p.autor === "agente") {
    const cfgAg = await obterConfig("agente");
    if (!cfgAg.ativo) await bloquear("Agente comercial desativado no painel.");
    if (!conversa.agenteAtivo || conversa.status !== "ativa" || lead?.automacaoPausada) {
      await bloquear("Automação pausada nesta conversa (transferida para atendimento humano).");
    }
    if (conversa.saidasSemResposta >= cfgAg.maxSaidasSemResposta) await bloquear("O cliente ainda não respondeu: o agente não insiste.");
    if ((await contarEnviosHoje({ conversaId: conversa.id, autor: "agente" })) >= cfgAg.maxMensagensPorConversaDia) {
      await bloquear("Limite diário de mensagens do agente nesta conversa.");
    }
  }

  const msg = await db.mensagem.create({
    data: {
      conversaId: conversa.id,
      direcao: "saida",
      autor: p.autor,
      tipo: p.template ? "template" : "texto",
      conteudo: p.texto ?? p.template!.texto ?? `[Template: ${p.template!.nome}]${p.template!.parametros.length ? ` ${p.template!.parametros.join(" | ")}` : ""}`,
      templateNome: p.template?.nome ?? null,
      status: "pendente",
    },
  });

  try {
    const cliente = await clienteWhatsApp();
    const r = p.template
      ? await cliente.enviarTemplate(conversa.telefoneE164, p.template.nome, p.template.idioma, p.template.parametros, p.template.texto)
      : await cliente.enviarTexto(conversa.telefoneE164, p.texto!);
    const enviada = await db.mensagem.update({ where: { id: msg.id }, data: { waMessageId: r.id, status: "enviada", statusEm: new Date() } });
    await db.conversa.update({
      where: { id: conversa.id },
      data: { ultimaSaidaEm: new Date(), saidasSemResposta: { increment: 1 } },
    });
    if (lead) await db.lead.update({ where: { id: lead.id }, data: { ultimaInteracaoEm: new Date() } });
    if (p.template) {
      await db.registroCusto.create({
        data: {
          categoria: "whatsapp",
          provedor: cliente.modo === "cloud" ? "meta" : cliente.modo,
          operacao: "mensagem_template",
          custoUsd: cliente.modo === "cloud" ? cfgWa.precoTemplateUsd : 0,
          estimado: true,
          leadId: lead?.id ?? null,
          conversaId: conversa.id,
        },
      });
    }
    if (p.usuarioId) await auditar(p.usuarioId, p.template ? "template_enviado" : "mensagem_manual", lead?.id ?? conversa.id);
    // No simulador, a "Meta" confirma a entrega logo depois, pelo mesmo caminho do webhook real.
    if (cliente.modo === "mock") await enfileirar("whatsapp_mock_status", { waMessageId: r.id }, { atrasoMs: 1500 });
    await emitir("mensagem.nova", { conversaId: conversa.id, leadId: lead?.id });
    return enviada;
  } catch (e) {
    const definitivo = e instanceof ErroWhatsApp ? e.definitivo : true;
    await db.mensagem.update({ where: { id: msg.id }, data: { status: "falhou", erro: mensagemErro(e), statusEm: new Date() } });
    await registrarLog("erro", "whatsapp", `Falha ao enviar: ${mensagemErro(e)}`, { leadId: lead?.id });
    await emitir("mensagem.status", { conversaId: conversa.id, leadId: lead?.id });
    if (!definitivo) throw e;
    throw new EnvioBloqueado(mensagemErro(e));
  }
}

/**
 * Primeiro contato (template na Cloud API, texto no Baileys). Sem autorização registrada, registra sozinho
 * com base em legítimo interesse (contato comercial B2B com telefone público). Opt-out e supressão continuam bloqueando.
 */
export async function iniciarContato(leadId: string, usuarioId: string) {
  let lead = await db.lead.findUniqueOrThrow({ where: { id: leadId } });
  if (lead.contatoStatus !== "autorizado") {
    await registrarConsentimento(
      leadId,
      { origem: "Telefone comercial público da empresa (encontrado na prospecção). Contato B2B.", baseLegal: "legitimo_interesse" },
      usuarioId,
    );
    lead = await db.lead.findUniqueOrThrow({ where: { id: leadId } });
  }
  const consentimento = await db.consentimento.findFirst({ where: { leadId, tipo: "opt_in" }, orderBy: { criadoEm: "desc" } });
  const tel = consentimento?.telefoneE164 ?? telefoneDoLead(lead);
  if (!tel) throw new EnvioBloqueado("Lead sem número de WhatsApp autorizado.");

  const cfg = await obterConfig("agente");
  const cliente = await clienteWhatsApp();
  const nome = cfg.templatePrimeiroContato || { mock: "primeiro_contato_simulado", baileys: "primeiro_contato_baileys", cloud: "" }[cliente.modo];
  if (!nome) throw new EnvioBloqueado("Configure o nome do template aprovado de primeiro contato em Admin > Agente.");
  // Baileys não tem templates: manda o texto configurado, com os mesmos limites e exigência de opt-in.
  const texto =
    cliente.modo === "baileys"
      ? cfg.mensagemPrimeiroContato
          .replaceAll("{nome}", lead.nome)
          .replaceAll("{agente}", cfg.nomeAgente || "a equipe")
          .replaceAll("{empresa}", cfg.nomeEmpresa || "nossa empresa")
          .replaceAll("{gancho}", ganchoPrimeiroContato(lead))
          .replace(/s{2,}/g, " ")
      : undefined;
  if (cliente.modo === "baileys" && !texto?.trim()) throw new EnvioBloqueado("Configure o texto do primeiro contato (modo Baileys) em Admin > Agente.");

  const conversa = await obterConversa(tel, leadId);
  if (conversa.status !== "ativa") {
    await db.conversa.update({ where: { id: conversa.id }, data: { status: "ativa", agenteAtivo: !lead.automacaoPausada } });
  }
  const msg = await enviarMensagem({ conversaId: conversa.id, autor: "humano", usuarioId, template: { nome, idioma: cfg.idiomaTemplate, parametros: [], texto } });
  await moverEtapa(leadId, "aguardando_resposta", "Contato iniciado por template; aguardando resposta.", usuarioId);
  await db.interacaoLead.create({ data: { leadId, tipo: "contato", descricao: `Primeiro contato enviado (template ${nome}).`, usuarioId } });
  return { conversa, mensagem: msg };
}

// ───────────── Transferência para humano ─────────────

export async function transferirParaHumano(conversaId: string, motivo: string, por: { usuarioId?: string | null; agente?: boolean; aceite?: boolean }) {
  const c = await db.conversa.update({ where: { id: conversaId }, data: { status: "transferida", agenteAtivo: false } });
  if (c.leadId) {
    await db.lead.update({ where: { id: c.leadId }, data: { automacaoPausada: true, transferidoEm: new Date(), motivoTransferencia: motivo } });
    await moverEtapa(c.leadId, "intervencao_humana", `Transferido para atendimento humano: ${motivo}`, por.usuarioId ?? null);
    await db.interacaoLead.create({ data: { leadId: c.leadId, tipo: "transferencia", descricao: motivo, usuarioId: por.usuarioId ?? null } });
  }
  const lead = c.leadId ? await db.lead.findUnique({ where: { id: c.leadId }, select: { nome: true } }) : null;
  const n = await db.notificacao.create({
    data: por.aceite
      ? { tipo: "aceite", titulo: `Cliente aceitou! Gere o contrato: ${lead?.nome ?? c.telefoneE164}`, mensagem: motivo, leadId: c.leadId }
      : { tipo: "transferencia", titulo: `Atendimento humano: ${lead?.nome ?? c.telefoneE164}`, mensagem: motivo, leadId: c.leadId },
  });
  await auditar(por.usuarioId ?? null, por.agente ? "transferencia_agente" : "transferencia_manual", c.leadId ?? c.id, { motivo });
  await emitir("notificacao.nova", { id: n.id, leadId: c.leadId });
  await emitir("lead.atualizado", { id: c.leadId });
}

/** Só uma pessoa pode devolver a conversa ao agente, e fica auditado. */
export async function reativarAgente(conversaId: string, usuarioId: string) {
  const c = await db.conversa.findUniqueOrThrow({ where: { id: conversaId }, include: { lead: true } });
  if (c.lead?.naoContatar) throw new EnvioBloqueado("Contato com opt-out: o agente não pode ser reativado.");
  await db.conversa.update({ where: { id: conversaId }, data: { status: "ativa", agenteAtivo: true, saidasSemResposta: 0 } });
  if (c.leadId) {
    await db.lead.update({ where: { id: c.leadId }, data: { automacaoPausada: false } });
    await moverEtapa(c.leadId, "em_negociacao", "Agente reativado manualmente.", usuarioId);
  }
  await auditar(usuarioId, "agente_reativado", c.leadId ?? c.id);
  await emitir("lead.atualizado", { id: c.leadId });
}

export async function pausarAgente(conversaId: string, usuarioId: string) {
  await transferirParaHumano(conversaId, "Atendimento assumido manualmente.", { usuarioId });
}

// ───────────── Processamento do webhook ─────────────

export async function processarEntrada(e: EntradaWhatsApp): Promise<{ mensagemId: string; acao: string }> {
  const tel = e164DoWaId(e.de);
  const lead = await encontrarLeadPorTelefone(tel);
  const conversa = await obterConversa(tel, lead?.id ?? null);

  const existente = await db.mensagem.findUnique({ where: { waMessageId: e.waMessageId } });
  if (existente) return { mensagemId: existente.id, acao: "repetida" };

  const msg = await db.mensagem.create({
    data: {
      conversaId: conversa.id,
      direcao: "entrada",
      autor: "cliente",
      conteudo: e.texto,
      waMessageId: e.waMessageId,
      status: "recebida",
    },
  });
  await db.conversa.update({ where: { id: conversa.id }, data: { ultimaEntradaEm: new Date(), saidasSemResposta: 0 } });
  await emitir("mensagem.nova", { conversaId: conversa.id, leadId: lead?.id });

  const cfgT = await obterConfig("transferencia");
  if (pediuOptOut(e.texto, cfgT.palavrasOptOut)) {
    const cfgA = await obterConfig("agente");
    // Confirmação única, dentro da janela aberta pelo próprio cliente; depois disso, silêncio.
    try {
      await enviarMensagem({ conversaId: conversa.id, autor: "sistema", texto: cfgA.mensagemOptOut });
    } catch {
      // se não der para confirmar, o opt-out vale do mesmo jeito
    }
    await registrarOptOut({ leadId: lead?.id, telefone: tel }, "Cliente pediu pelo WhatsApp para não receber mensagens.", null);
    return { mensagemId: msg.id, acao: "opt_out" };
  }

  if (!lead) {
    const n = await db.notificacao.create({
      data: { tipo: "info", titulo: "Mensagem de número desconhecido", mensagem: `${tel}${e.nome ? ` (${e.nome})` : ""}: ${e.texto.slice(0, 200)}` },
    });
    await emitir("notificacao.nova", { id: n.id });
    return { mensagemId: msg.id, acao: "sem_lead" };
  }

  await db.lead.update({ where: { id: lead.id }, data: { ultimaInteracaoEm: new Date() } });
  // O próprio cliente escreveu: registra como base para responder nesta conversa (janela de 24 h).
  if (lead.contatoStatus === "sem_autorizacao") {
    await registrarConsentimento(lead.id, { origem: "O cliente enviou mensagem pelo WhatsApp.", baseLegal: "consentimento", evidencia: `wamid ${e.waMessageId}`, telefone: tel }, "cliente");
  }

  const conv = await db.conversa.findUniqueOrThrow({ where: { id: conversa.id } });
  if (conv.status === "transferida" || !conv.agenteAtivo || lead.automacaoPausada) {
    const n = await db.notificacao.create({
      data: { tipo: "transferencia", titulo: `Nova mensagem de ${lead.nome}`, mensagem: e.texto.slice(0, 300), leadId: lead.id },
    });
    await emitir("notificacao.nova", { id: n.id, leadId: lead.id });
    return { mensagemId: msg.id, acao: "humano" };
  }

  const etapaAtual = lead.etapaId ? await db.etapaCrm.findUnique({ where: { id: lead.etapaId } }) : null;
  if (!etapaAtual || ["novo", "em_analise", "qualificado", "aguardando_autorizacao", "contato_iniciado", "aguardando_resposta"].includes(etapaAtual.chave)) {
    await moverEtapa(lead.id, "em_negociacao", "Cliente respondeu; conversa em andamento.");
  }
  await enfileirar("agente_responder", { conversaId: conversa.id, mensagemId: msg.id }, { chave: `agente:${msg.id}`, maxTentativas: 3 });
  return { mensagemId: msg.id, acao: "agente" };
}

const ORDEM_STATUS = ["pendente", "enviada", "entregue", "lida"];
const STATUS_META: Record<string, string> = { sent: "enviada", delivered: "entregue", read: "lida", failed: "falhou" };

export async function processarStatus(s: StatusWhatsApp): Promise<void> {
  const novo = STATUS_META[s.status];
  if (!novo) return;
  const m = await db.mensagem.findUnique({ where: { waMessageId: s.waMessageId } });
  if (!m) return;
  // Status chegam fora de ordem: nunca volta de "lida" para "entregue". A condição no UPDATE torna isso atômico.
  const anteriores = novo === "falhou" ? ["pendente", "enviada"] : ORDEM_STATUS.slice(0, ORDEM_STATUS.indexOf(novo));
  const r = await db.mensagem.updateMany({
    where: { id: m.id, status: { in: anteriores } },
    data: { status: novo, statusEm: new Date(s.timestamp || Date.now()), ...(s.erro ? { erro: s.erro } : {}) },
  });
  if (!r.count) return;
  if (novo === "falhou") await registrarLog("erro", "whatsapp", `Mensagem não entregue: ${s.erro ?? "sem detalhe"}`);
  await emitir("mensagem.status", { conversaId: m.conversaId });
}
