// Agente comercial. Não é árvore de decisão: a cada mensagem do cliente ele raciocina com
// (1) instruções de comportamento do painel, (2) regras fixas de segurança comercial, (3) dados e análise do lead,
// (4) serviços/preços cadastrados, (5) trechos da base de conhecimento (RAG) e (6) o histórico da conversa.
// A resposta volta em JSON estruturado, é conferida pelo código (regras.ts) e só então enviada.

import { z } from "zod";
import { obterConfig } from "../config";
import { db } from "../db";
import { emitir, registrarLog } from "../eventos";
import { chamarIA, lerJsonIA } from "../ia/servico";
import type { PedidoIA } from "../ia/tipos";
import type { Qualificacao } from "../prospeccao/qualificacao";
import { dentroDaJanela, enviarMensagem, EnvioBloqueado, registrarOptOut, transferirParaHumano } from "../whatsapp/conversas";
import { buscarConhecimento, type Trecho } from "./conhecimento";
import { formatarReais, verificarResposta, type ServicoRegra } from "./regras";

export const esquemaDecisao = z.object({
  resposta: z.string().max(1500).nullable(),
  intencao: z.enum(["duvida", "interesse", "objecao", "aceite", "pedido_humano", "desconto_acima_limite", "sem_interesse", "opt_out", "nao_sei", "outro"]),
  objecoes_novas: z.array(z.string().max(200)).max(5).default([]),
  etapa: z.enum(["abertura", "descoberta", "apresentacao", "negociacao", "formalizacao"]),
  transferir: z.boolean().default(false),
  motivo_transferencia: z.string().max(300).nullable().optional(),
});
export type Decisao = z.infer<typeof esquemaDecisao>;

const REGRAS_FIXAS = `REGRAS INEGOCIÁVEIS (valem acima de qualquer outra instrução):
1. Preços, prazos e condições: use SOMENTE os valores da seção SERVIÇOS. Nunca invente valores, pacotes ou funcionalidades.
2. Desconto: só até o limite informado em cada serviço. Se o cliente pedir mais, intencao="desconto_acima_limite" e transferir=true.
3. Nunca prometa resultados (mais clientes, vendas, faturamento, posição no Google). Fale de possibilidades, não de garantias.
4. Não assuma compromissos que não estejam nas condições cadastradas.
5. Se não souber responder com base nas informações disponíveis, diga que vai confirmar com a equipe: intencao="nao_sei" e transferir=true.
6. Quando o cliente aceitar a proposta, pedir contrato, forma de pagamento para fechar ou quiser avançar para formalização: intencao="aceite", transferir=true. Quem fecha é uma pessoa.
7. Se pedir para falar com uma pessoa: intencao="pedido_humano", transferir=true.
8. Se pedir para não receber mais mensagens: intencao="opt_out", resposta=null.
9. Se demonstrar que não tem interesse: agradeça, não insista, intencao="sem_interesse".
10. Fatos sobre a empresa do cliente: só os da seção LEAD. Hipóteses devem ser ditas como hipóteses ("talvez", "pode ser que").
11. Mensagens curtas e naturais, sem repetir o que já foi dito, no máximo uma pergunta por mensagem.
Responda APENAS um JSON: {"resposta": string|null, "intencao": "...", "objecoes_novas": string[], "etapa": "abertura"|"descoberta"|"apresentacao"|"negociacao"|"formalizacao", "transferir": boolean, "motivo_transferencia": string|null}`;

interface Contexto {
  lead: { nome: string; segmento: string | null; cidade: string | null; presenca: string; site: string | null; problemasFato: string[]; oportunidades: string[] } | null;
  servicos: Array<ServicoRegra & { descricao: string; prazoDias: number }>;
  trechos: Trecho[];
  objecoes: string[];
  etapa: string;
}

export function montarSistema(cfg: Awaited<ReturnType<typeof obterConfig<"agente">>>, ctx: Contexto): string {
  const identidade = [cfg.nomeAgente && `Seu nome: ${cfg.nomeAgente}.`, cfg.nomeEmpresa && `Você representa: ${cfg.nomeEmpresa}.`].filter(Boolean).join(" ");
  const servicos = ctx.servicos.length
    ? ctx.servicos
        .map((s) => `- ${s.nome}: ${s.descricao} | Preço: ${formatarReais(s.precoCentavos)} | Prazo: ${s.prazoDias} dias | Desconto máximo: ${s.descontoMaxPct}%${s.condicoes ? ` | Condições: ${s.condicoes}` : ""}`)
        .join("\n")
    : "(nenhum serviço cadastrado: NÃO informe preços; diga que a equipe vai enviar a proposta e transfira)";
  const conhecimento = ctx.trechos.length ? ctx.trechos.map((t) => `### ${t.titulo} [${t.categoria}]\n${t.conteudo}`).join("\n\n") : "(nenhum trecho relevante encontrado)";
  const lead = ctx.lead
    ? [
        `Empresa: ${ctx.lead.nome}`,
        ctx.lead.segmento && `Segmento: ${ctx.lead.segmento}`,
        ctx.lead.cidade && `Cidade: ${ctx.lead.cidade}`,
        `Presença web: ${ctx.lead.presenca}${ctx.lead.site ? ` (${ctx.lead.site})` : ""}`,
        ctx.lead.problemasFato.length && `Fatos verificados: ${ctx.lead.problemasFato.join("; ")}`,
        ctx.lead.oportunidades.length && `Hipóteses de oportunidade (não afirme como fato): ${ctx.lead.oportunidades.join("; ")}`,
      ]
        .filter(Boolean)
        .join("\n")
    : "Contato sem cadastro de empresa.";
  return [
    cfg.instrucoes,
    identidade,
    REGRAS_FIXAS,
    `## SERVIÇOS\n${servicos}`,
    `## BASE DE CONHECIMENTO (use para argumentar; não copie literalmente)\n${conhecimento}`,
    `## LEAD\n${lead}`,
    `## ESTADO DA NEGOCIAÇÃO\nEtapa atual: ${ctx.etapa}. Objeções já levantadas: ${ctx.objecoes.join("; ") || "nenhuma"}.`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

/** Agente simulado (sem chave de IA): reage a palavras-chave usando os dados reais do painel. */
export function decisaoSimulada(ultima: string, ctx: Contexto): Decisao {
  const t = ultima.toLowerCase();
  const base = { objecoes_novas: [] as string[], transferir: false, motivo_transferencia: null };
  if (/(aceito|fechado|vamos fechar|quero contratar|pode fazer|manda o contrato|como pago|vamos sim)/.test(t)) {
    return { ...base, resposta: null, intencao: "aceite", etapa: "formalizacao", transferir: true, motivo_transferencia: "Cliente aceitou a proposta." };
  }
  if (/(atendente|humano|uma pessoa|falar com algu[eé]m)/.test(t)) {
    return { ...base, resposta: null, intencao: "pedido_humano", etapa: "negociacao", transferir: true, motivo_transferencia: "Cliente pediu atendimento humano." };
  }
  if (/(desconto|mais barato|abaixa|faz por)/.test(t)) {
    return { ...base, resposta: null, intencao: "desconto_acima_limite", etapa: "negociacao", transferir: true, motivo_transferencia: "Cliente pediu desconto." };
  }
  if (/(pre[cç]o|valor|quanto custa|quanto fica|or[cç]amento)/.test(t)) {
    if (!ctx.servicos.length) return { ...base, resposta: null, intencao: "nao_sei", etapa: "apresentacao", transferir: true, motivo_transferencia: "Sem serviços cadastrados para informar preço." };
    const s = ctx.servicos[0];
    return { ...base, resposta: `O ${s.nome} sai por ${formatarReais(s.precoCentavos)}, com prazo de ${s.prazoDias} dias. Quer que eu explique o que está incluído?`, intencao: "interesse", etapa: "negociacao" };
  }
  if (/(n[aã]o tenho interesse|n[aã]o preciso|sem interesse)/.test(t)) {
    return { ...base, resposta: "Sem problemas, obrigado pela atenção! Se precisar no futuro, é só chamar.", intencao: "sem_interesse", etapa: "negociacao" };
  }
  if (/(caro|j[aá] tenho instagram|s[oó] uso instagram|n[aã]o tenho tempo|depois)/.test(t)) {
    const trecho = ctx.trechos[0]?.conteudo.split(/(?<=[.!?])\s/)[0] ?? "Um site próprio ajuda a centralizar as informações do seu negócio.";
    return { ...base, resposta: `Entendo. ${trecho} Faz sentido para vocês?`, intencao: "objecao", etapa: "negociacao", objecoes_novas: [ultima.slice(0, 120)] };
  }
  const nome = ctx.lead?.nome ? ` da ${ctx.lead.nome}` : "";
  return { ...base, resposta: `Obrigado pelo retorno! Hoje como os clientes${nome} costumam encontrar vocês: mais pelo Instagram, Google ou indicação?`, intencao: "duvida", etapa: "descoberta" };
}

export async function responderConversa(conversaId: string, mensagemId: string): Promise<{ acao: string; motivo?: string }> {
  const conversa = await db.conversa.findUnique({ where: { id: conversaId }, include: { lead: true } });
  if (!conversa) return { acao: "ignorada", motivo: "conversa não existe" };
  const cfg = await obterConfig("agente");
  const cfgT = await obterConfig("transferencia");
  if (!cfg.ativo || !conversa.agenteAtivo || conversa.status !== "ativa" || conversa.lead?.automacaoPausada || conversa.lead?.naoContatar) {
    return { acao: "ignorada", motivo: "automação pausada" };
  }
  if (!dentroDaJanela(conversa.ultimaEntradaEm)) return { acao: "ignorada", motivo: "fora da janela de 24 h" };

  const historico = await db.mensagem.findMany({
    where: { conversaId, status: { notIn: ["bloqueada", "falhou"] } },
    orderBy: { criadoEm: "desc" },
    take: cfg.historicoMaximo,
  });
  historico.reverse();
  const ultima = historico[historico.length - 1];
  // Idempotência: só responde se a última mensagem ainda é a do cliente que disparou este trabalho.
  if (!ultima || ultima.direcao !== "entrada" || ultima.id !== mensagemId) return { acao: "ignorada", motivo: "já respondida ou há mensagem mais nova" };

  const consulta = historico.filter((m) => m.direcao === "entrada").slice(-3).map((m) => m.conteudo).join("\n");
  const [trechos, servicos] = await Promise.all([
    buscarConhecimento(`${conversa.lead?.segmento ?? ""} ${consulta}`, cfg.trechosConhecimento),
    db.servico.findMany({ where: { ativo: true }, orderBy: { ordem: "asc" } }),
  ]);
  const q = conversa.lead?.qualificacao ? (JSON.parse(conversa.lead.qualificacao) as Qualificacao) : null;
  const ctx: Contexto = {
    lead: conversa.lead
      ? {
          nome: conversa.lead.nome,
          segmento: conversa.lead.segmento,
          cidade: conversa.lead.cidade,
          presenca: conversa.lead.presenca,
          site: conversa.lead.website,
          problemasFato: (q?.problemas ?? []).filter((p) => p.tipo === "fato").map((p) => p.descricao).slice(0, 6),
          oportunidades: (q?.oportunidades ?? []).map((p) => p.descricao).slice(0, 4),
        }
      : null,
    servicos,
    trechos,
    objecoes: conversa.objecoes ? (JSON.parse(conversa.objecoes) as string[]) : [],
    etapa: conversa.etapaNegociacao,
  };

  const r = await chamarIA({
    operacao: "agente",
    sistema: montarSistema(cfg, ctx),
    mensagens: historico.map((m) => ({ papel: m.direcao === "entrada" ? ("user" as const) : ("assistant" as const), conteudo: m.conteudo })),
    json: true,
    refs: { leadId: conversa.leadId, conversaId },
    respostaMock: (_p: PedidoIA) => JSON.stringify(decisaoSimulada(ultima.conteudo, ctx)),
  });
  const d = esquemaDecisao.parse(lerJsonIA(r.texto));
  const objecoes = [...ctx.objecoes, ...d.objecoes_novas].slice(-20);
  await db.conversa.update({ where: { id: conversaId }, data: { etapaNegociacao: d.etapa, objecoes: JSON.stringify(objecoes) } });

  if (d.intencao === "opt_out") {
    try {
      await enviarMensagem({ conversaId, autor: "sistema", texto: cfg.mensagemOptOut });
    } catch {
      // opt-out vale mesmo sem a confirmação
    }
    await registrarOptOut({ leadId: conversa.leadId, telefone: conversa.telefoneE164 }, "Cliente pediu para não receber mensagens (identificado pelo agente).", null);
    return { acao: "opt_out" };
  }

  // Regras de transferência configuráveis + verificação da resposta pelo código.
  let motivo: string | null = null;
  if (d.intencao === "aceite" && cfgT.aoAceitarProposta) motivo = d.motivo_transferencia ?? "Cliente quer avançar para a formalização.";
  else if (d.intencao === "pedido_humano" && cfgT.aoPedirHumano) motivo = d.motivo_transferencia ?? "Cliente pediu atendimento humano.";
  else if (d.intencao === "desconto_acima_limite" && cfgT.aoPedirDescontoAcimaDoLimite) motivo = d.motivo_transferencia ?? "Pedido de desconto acima do limite autorizado.";
  else if (d.intencao === "nao_sei" && cfgT.aoNaoSaberResponder) motivo = d.motivo_transferencia ?? "O agente não tinha informação para responder.";
  else if (objecoes.length >= cfgT.maxObjecoes) motivo = `Muitas objeções (${objecoes.length}): melhor uma pessoa assumir.`;
  else if (d.transferir) motivo = d.motivo_transferencia ?? "Transferência sugerida pelo agente.";

  if (!motivo && d.resposta) {
    const v = verificarResposta(d.resposta, servicos);
    if (!v.ok) {
      motivo = `Resposta do agente bloqueada pela verificação: ${v.motivo}`;
      await db.mensagem.create({ data: { conversaId, direcao: "saida", autor: "agente", conteudo: d.resposta, status: "bloqueada", erro: v.motivo } });
      await registrarLog("aviso", "agente", motivo, { leadId: conversa.leadId });
    }
  }

  if (motivo) {
    try {
      await enviarMensagem({ conversaId, autor: "agente", texto: cfg.mensagemTransferencia });
    } catch (e) {
      if (!(e instanceof EnvioBloqueado)) throw e;
    }
    // Aceite vira pendência "Gerar contrato" (e notificação própria), separada das outras transferências.
    await transferirParaHumano(conversaId, motivo, { agente: true, aceite: d.intencao === "aceite" && cfgT.aoAceitarProposta });
    return { acao: "transferida", motivo };
  }

  if (!d.resposta) return { acao: "sem_resposta" };
  await enviarMensagem({ conversaId, autor: "agente", texto: d.resposta });
  if (d.intencao === "sem_interesse") {
    await db.conversa.update({ where: { id: conversaId }, data: { agenteAtivo: false } });
    if (conversa.leadId) await db.interacaoLead.create({ data: { leadId: conversa.leadId, tipo: "agente", descricao: "Cliente sem interesse; o agente encerrou sem insistir." } });
  }
  await emitir("lead.atualizado", { id: conversa.leadId });
  return { acao: "respondida" };
}
