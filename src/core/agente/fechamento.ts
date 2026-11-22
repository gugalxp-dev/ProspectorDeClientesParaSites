// Modo "IA fecha a venda": a IA coleta os dados do contrato na conversa e envia o contrato sozinha.
// Os dados ficam no rascunho do contrato do lead (o mesmo que você vê na página do lead).
// O preço final é conferido aqui: nunca abaixo do valor mínimo do serviço (preço - desconto máximo).

import { obterConfig } from "../config";
import { dadosIniciais, enviarPorWhatsApp, esquemaDadosContrato, finalizar, pendenciasContrato, reais, salvarRascunho, type DadosContrato } from "../contratos";
import { db } from "../db";
import { registrarLog } from "../eventos";
import { descontoMaximo, type ServicoRegra } from "./regras";

type Servico = ServicoRegra & { descricao: string; prazoDias: number };

export interface DadosFechamento {
  servico?: string | null;
  valor_final?: number | string | null;
  forma_pagamento?: string | null;
  nome_contratante?: string | null;
  documento?: string | null;
  endereco?: string | null;
  email?: string | null;
}

const sem = (t: string) =>
  t
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();

/** "R$ 650,00", "650", 650 -> 65000 centavos. */
export function centavosDoValor(v: number | string | null | undefined): number | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) && v > 0 ? Math.round(v * 100) : null;
  const limpo = v.replace(/[^\d,.]/g, "");
  if (!limpo) return null;
  const numero = limpo.includes(",") ? Number(limpo.replace(/\./g, "").replace(",", ".")) : Number(limpo);
  return Number.isFinite(numero) && numero > 0 ? Math.round(numero * 100) : null;
}

function acharServico(nome: string | null | undefined, servicos: Servico[]): Servico | null {
  if (!nome) return null;
  const n = sem(nome);
  return servicos.find((s) => sem(s.nome) === n) ?? servicos.find((s) => n.includes(sem(s.nome)) || sem(s.nome).includes(n)) ?? null;
}

async function rascunhoAtual(leadId: string) {
  return db.contrato.findFirst({ where: { leadId, status: "rascunho" } });
}

const ATIVOS = ["pronto", "enviado", "visualizado", "aceito", "cobrado"];

/** Já existe contrato enviado ou aceito: a negociação dessa venda terminou, não abre outro rascunho. */
async function contratoAtivo(leadId: string) {
  return db.contrato.findFirst({ where: { leadId, status: { in: ATIVOS } } });
}

/** Junta o que o cliente informou nesta mensagem ao rascunho do contrato. */
export async function aplicarFechamento(leadId: string, f: DadosFechamento, servicos: Servico[]): Promise<DadosContrato | null> {
  if (await contratoAtivo(leadId)) return null;
  const r = await rascunhoAtual(leadId);
  const dados: DadosContrato = r ? esquemaDadosContrato.parse(JSON.parse(r.dados)) : await dadosIniciais(leadId);
  const s = acharServico(f.servico, servicos) ?? acharServico(dados.servico, servicos);
  if (s && sem(s.nome) !== sem(dados.servico)) {
    Object.assign(dados, { servico: s.nome, descricaoServico: s.descricao, prazoDias: s.prazoDias, valorCentavos: s.precoCentavos });
  }
  const valor = centavosDoValor(f.valor_final);
  if (valor && s) {
    const minimo = s.precoCentavos - descontoMaximo(s);
    if (valor >= minimo && valor <= s.precoCentavos) dados.valorCentavos = valor;
    else await registrarLog("aviso", "agente", `Valor ${reais(valor)} fora do permitido para ${s.nome} (mínimo ${reais(minimo)}); mantido ${reais(dados.valorCentavos)}.`, { leadId });
  }
  if (f.forma_pagamento?.trim()) dados.formaPagamento = f.forma_pagamento.trim();
  if (f.nome_contratante?.trim()) dados.contratanteNome = f.nome_contratante.trim();
  if (f.documento?.trim()) dados.contratanteDocumento = f.documento.trim();
  if (f.endereco?.trim()) dados.contratanteEndereco = f.endereco.trim();
  if (f.email?.trim()) dados.contratanteEmail = f.email.trim();
  await salvarRascunho(leadId, dados, null);
  return dados;
}

/** Texto para a IA: o que já foi coletado, o que falta e se o contrato já foi enviado. */
export async function estadoFechamento(leadId: string): Promise<string> {
  const enviado = await db.contrato.findFirst({ where: { leadId, status: { in: ["pronto", "enviado", "visualizado", "aceito", "cobrado"] } }, orderBy: { criadoEm: "desc" } });
  if (enviado) {
    return ["aceito", "cobrado"].includes(enviado.status)
      ? `Contrato nº ${enviado.numero} ACEITO pelo cliente. Agora a equipe envia o link de pagamento.`
      : `Contrato nº ${enviado.numero} já ENVIADO ao cliente (aguardando o aceite no link). Não envie de novo; ajude com dúvidas sobre ele.`;
  }
  const r = await rascunhoAtual(leadId);
  const d: DadosContrato = r ? esquemaDadosContrato.parse(JSON.parse(r.dados)) : await dadosIniciais(leadId);
  const cfg = await obterConfig("contrato");
  const doc = d.contratanteDocumento.replace(/\D/g, "");
  const linha = (rotulo: string, valor: string, ok: boolean) => `- ${rotulo}: ${ok ? valor : "FALTA"}`;
  return [
    "Já coletado / falta (peça só o que falta, um por vez):",
    linha("Serviço", `${d.servico} por ${reais(d.valorCentavos)}`, !!d.servico && d.valorCentavos > 0),
    linha("Nome ou razão social do contratante", d.contratanteNome, !!d.contratanteNome),
    linha("CPF ou CNPJ", d.contratanteDocumento, doc.length === 11 || doc.length === 14),
    linha("Endereço", d.contratanteEndereco, !!d.contratanteEndereco),
    `- E-mail (opcional): ${d.contratanteEmail || "não informado"}`,
    linha("Forma de pagamento escolhida", d.formaPagamento, r !== null && !!d.formaPagamento && d.formaPagamento !== esquemaDadosContrato.parse({}).formaPagamento),
    pendenciasContrato(d, cfg).length ? "" : "Tudo completo: confirme o resumo com o cliente e, com o ok dele, use enviar_contrato=true.",
  ]
    .filter(Boolean)
    .join("\n");
}

/** A IA pediu para enviar: só envia se estiver tudo completo. Devolve o que falta, se faltar. */
export async function enviarContratoPelaIa(leadId: string, origem?: string): Promise<{ enviado: boolean; falta: string[] }> {
  if (await contratoAtivo(leadId)) return { enviado: false, falta: ["contrato já enviado (não envia outro)"] };
  const r = await rascunhoAtual(leadId);
  if (!r) return { enviado: false, falta: ["dados do contrato"] };
  const cfg = await obterConfig("contrato");
  const falta = pendenciasContrato(esquemaDadosContrato.parse(JSON.parse(r.dados)), cfg);
  if (falta.length) return { enviado: false, falta };
  await finalizar(r.id, null);
  await enviarPorWhatsApp(r.id, null, origem);
  await db.interacaoLead.create({ data: { leadId, tipo: "contrato", descricao: `A IA fechou a negociação e enviou o contrato nº ${r.numero}.` } });
  return { enviado: true, falta: [] };
}
