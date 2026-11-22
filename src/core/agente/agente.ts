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
import { dentroDaJanela, enviarMensagem, EnvioBloqueado, registrarOptOut, transferirParaHumano } from "../whatsapp/conversas";
import { buscarConhecimento, type Trecho } from "./conhecimento";
import { COMO_USAR_DIAGNOSTICO, diagnosticar, diagnosticoParaAgente } from "./diagnostico";
import { aplicarFechamento, enviarContratoPelaIa, estadoFechamento } from "./fechamento";
import { descontoMaximo, formatarReais, paraWhatsApp, verificarResposta, type ServicoRegra } from "./regras";

const INTENCOES = ["duvida", "interesse", "objecao", "aceite", "pedido_humano", "desconto_acima_limite", "sem_interesse", "opt_out", "nao_sei", "outro"] as const;
const ETAPAS = ["abertura", "descoberta", "apresentacao", "negociacao", "formalizacao"] as const;

/** Sinônimos que o modelo às vezes usa no lugar dos valores pedidos (já sem acento e em minúsculas). */
const SINONIMOS: Record<string, (typeof INTENCOES)[number]> = {
  pergunta: "duvida", questao: "duvida", esclarecimento: "duvida",
  interessado: "interesse", positivo: "interesse", confirmacao: "interesse", concordancia: "interesse", sim: "interesse", curiosidade: "interesse",
  objecoes: "objecao", resistencia: "objecao", hesitacao: "objecao", preco: "objecao",
  aceitou: "aceite", aceitacao: "aceite", fechamento: "aceite", fechar: "aceite", compra: "aceite",
  humano: "pedido_humano", atendente: "pedido_humano", falar_com_humano: "pedido_humano",
  desconto: "desconto_acima_limite",
  desinteresse: "sem_interesse", nao_interessado: "sem_interesse", recusa: "sem_interesse", negativo: "sem_interesse",
  optout: "opt_out", parar: "opt_out", descadastrar: "opt_out",
  nao_sabe: "nao_sei", desconhecido: "nao_sei",
};

/** "Dúvida", "dúvida ", "pedido humano" -> "duvida", "pedido_humano". */
const normalizarValor = (v: unknown) =>
  typeof v === "string"
    ? v
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .trim()
        .toLowerCase()
        .replace(/[\s-]+/g, "_")
    : v;

/**
 * Decisão do agente. Tolerante com variações do modelo (acento, sinônimo, valor inesperado):
 * uma palavra fora da lista não pode deixar o cliente sem resposta. Valor desconhecido vira "outro".
 */
export const esquemaDecisao = z.object({
  resposta: z.string().max(3500).nullable(),
  intencao: z.preprocess((v) => {
    const n = normalizarValor(v);
    return typeof n === "string" ? (SINONIMOS[n] ?? n) : n;
  }, z.enum(INTENCOES).catch("outro")),
  objecoes_novas: z.array(z.string().max(200)).max(5).catch([]).default([]),
  etapa: z.preprocess(normalizarValor, z.enum(ETAPAS).catch("descoberta")),
  transferir: z.boolean().catch(false).default(false),
  motivo_transferencia: z.string().max(300).nullable().optional().catch(null),
  /** Modo "IA fecha a venda": dados do contrato informados pelo cliente até agora (acumulam a cada mensagem). */
  fechamento: z
    .object({
      servico: z.string().max(200).nullish(),
      valor_final: z.union([z.number(), z.string().max(30)]).nullish(),
      forma_pagamento: z.string().max(200).nullish(),
      nome_contratante: z.string().max(200).nullish(),
      documento: z.string().max(30).nullish(),
      endereco: z.string().max(300).nullish(),
      email: z.string().max(200).nullish(),
    })
    .nullish()
    .catch(null),
  /** true quando o cliente confirmou e todos os dados estão completos: o sistema gera e envia o contrato. */
  enviar_contrato: z.boolean().catch(false).default(false),
});
export type Decisao = z.infer<typeof esquemaDecisao>;

const REGRA_DESCONTO_HUMANO = `2. Desconto: só até o limite informado em cada serviço. Se o cliente pedir mais, intencao="desconto_acima_limite" e transferir=true.`;
const REGRA_ACEITE_HUMANO = `6. Quando o cliente aceitar a proposta, pedir contrato, forma de pagamento para fechar ou quiser avançar para formalização: intencao="aceite", transferir=true. Quem fecha é uma pessoa.`;

/** Modo "IA fecha a venda": a IA negocia, coleta os dados e envia o contrato; a pessoa só entra na cobrança. */
const REGRA_DESCONTO_IA = `2. Negociação (siga em ordem):
   a) Na PRIMEIRA vez que o cliente pedir desconto ou achar caro: NÃO dê desconto, mas também NÃO diga que não existe desconto. Diga que o valor já é bem competitivo pelo que inclui, lembre o que ele ganha (conteúdo, layout, desenvolvimento, experiência do usuário, domínio e hospedagem de brinde...) ligado ao negócio dele, e pergunte o que mais pesa na decisão.
   b) Se insistir de novo: ofereça cerca de METADE do desconto máximo, condicionado a fechar agora.
   c) Só em último caso, se ainda insistir: o desconto máximo, como condição final.
   NUNCA diga qual é o desconto máximo nem use a palavra "até" com desconto; fale só do valor que está oferecendo naquele momento. NUNCA abaixo do "valor mínimo" do serviço. Se pedir mais, mantenha com educação e reforce o valor (intencao="desconto_acima_limite", sem transferir).`;
const REGRA_ACEITE_IA = `6. NÃO peça dados do contrato (nome, CPF/CNPJ, endereço, pagamento) antes de o cliente dizer claramente que quer fechar; até lá, apresente o valor, tire dúvidas e pergunte se faz sentido seguir. Quando o cliente aceitar (intencao="aceite"), VOCÊ fecha, sem transferir: peça UM dado por vez do que falta na seção FECHAMENTO (nome ou razão social, CPF/CNPJ, endereço, e-mail opcional) e a forma de pagamento entre as das condições do serviço. Preencha "fechamento" com tudo que o cliente já informou. Quando estiver tudo completo, confirme o resumo (serviço, valor, forma de pagamento) e, com o "ok" do cliente, responda que vai enviar o contrato e use "enviar_contrato": true. O contrato chega por link; depois do aceite a equipe envia o link de pagamento.`;

function regrasFixas(iaFecha: boolean): string {
  return `REGRAS INEGOCIÁVEIS (valem acima de qualquer outra instrução):
1. Preços, prazos e condições: use SOMENTE os valores da seção SERVIÇOS. Nunca invente valores, pacotes ou funcionalidades. Serviço "a partir de"/"sob consulta": levante o que o cliente precisa e transfira para orçamento (intencao="nao_sei", transferir=true).
${iaFecha ? REGRA_DESCONTO_IA : REGRA_DESCONTO_HUMANO}
3. Nunca prometa resultados (mais clientes, vendas, faturamento, posição no Google). Fale de possibilidades, não de garantias.
4. Não assuma compromissos que não estejam nas condições cadastradas.
5. Se não souber responder com base nas informações disponíveis, diga que vai confirmar com a equipe: intencao="nao_sei" e transferir=true.
${iaFecha ? REGRA_ACEITE_IA : REGRA_ACEITE_HUMANO}
7. Se pedir para falar com uma pessoa: intencao="pedido_humano", transferir=true.
8. Se pedir para não receber mais mensagens: intencao="opt_out", resposta=null.
9. "sem_interesse" SÓ quando o cliente recusa de forma clara e definitiva ("não tenho interesse", "não quero", "pode parar de me oferecer"). Dúvida ou resistência ("já vendo no Instagram", "não sei se preciso", "tá caro") é OBJEÇÃO: intencao="objecao", responda com argumento de valor baseado no diagnóstico. No sem_interesse: agradeça e não insista.
10. Fatos sobre a empresa do cliente: só os da seção LEAD. Hipóteses devem ser ditas como hipóteses ("talvez", "pode ser que").
11. Entenda o que o cliente quis dizer (mesmo resposta curta como "sim", "quanto?", "manda") e responda exatamente a isso, considerando todo o histórico.
12. Seja direto e conciso: de 1 a 3 frases curtas, como uma pessoa no WhatsApp. Sem introduções, sem repetir o que já foi dito, sem listas longas, no máximo uma pergunta por mensagem.
   EXCEÇÃO: se o cliente pedir para explicar como funciona, o que está incluído, o que ganha ou mais detalhes, responda COMPLETO e ORGANIZADO, usando SERVIÇOS e BASE DE CONHECIMENTO, neste formato:
   - 1 frase de abertura;
   - linha em branco + "*O que você ganha:*" e uma lista com "•", um item por linha, cada item com o nome em *negrito* e o benefício para o negócio dele (conteúdo do site, layout e desenvolvimento pensados no negócio, experiência do usuário, infraestrutura e hospedagem, domínio e hospedagem de brinde, SEO, segurança...);
   - se pedir como funciona: linha em branco + "*Como funciona:*" e as etapas numeradas (1., 2., 3....), uma por linha;
   - linha em branco + preço e prazo em *negrito*;
   - linha em branco + uma pergunta simples para seguir.
   Formatação do WhatsApp: negrito com *um asterisco*, listas com "•" ou "1.", linha em branco separando os blocos. Nunca use ** nem # (aparecem crus no WhatsApp).
13. Sempre escreva uma resposta (campo "resposta"), exceto no opt-out. "intencao" e "etapa" são só etiquetas internas para o sistema.
Responda APENAS um JSON: {"resposta": string|null, "intencao": "...", "objecoes_novas": string[], "etapa": "abertura"|"descoberta"|"apresentacao"|"negociacao"|"formalizacao", "transferir": boolean, "motivo_transferencia": string|null${
    iaFecha
      ? `, "fechamento": {"servico": string|null, "valor_final": number|null (em reais, já com desconto se houver), "forma_pagamento": string|null, "nome_contratante": string|null, "documento": string|null, "endereco": string|null, "email": string|null}|null, "enviar_contrato": boolean`
      : ""
  }}`;
}

interface Contexto {
  /** diagnostico: presença, fatos verificados com impacto, pontos fortes, canais e hipóteses (agente/diagnostico.ts). */
  lead: { nome: string; segmento: string | null; cidade: string | null; diagnostico: string } | null;
  servicos: Array<ServicoRegra & { descricao: string; prazoDias: number }>;
  trechos: Trecho[];
  objecoes: string[];
  etapa: string;
  /** Modo IA fecha a venda: dados do contrato já coletados e o que falta (texto pronto para o prompt). */
  fechamento?: string | null;
}

export function montarSistema(cfg: Awaited<ReturnType<typeof obterConfig<"agente">>>, ctx: Contexto): string {
  const identidade = [
    cfg.nomeAgente && `Seu nome: ${cfg.nomeAgente}.`,
    cfg.nomeEmpresa && `Você representa: ${cfg.nomeEmpresa}.`,
    cfg.siteEmpresa &&
      `Site da sua empresa (portfólio): ${cfg.siteEmpresa}. Envie esse link quando o cliente pedir mais detalhes, exemplos de trabalhos, referências ou quiser conhecer a empresa. Não mande sem contexto nem repita se já enviou na conversa.`,
  ]
    .filter(Boolean)
    .join(" ");
  const servicos = ctx.servicos.length
    ? ctx.servicos
        .map((s) => `- ${s.nome}: ${s.descricao} | Preço: ${formatarReais(s.precoCentavos)} | Prazo: ${s.prazoDias} dias | Desconto máximo (só em último caso): ${formatarReais(descontoMaximo(s))} (valor mínimo ${formatarReais(s.precoCentavos - descontoMaximo(s))})${s.condicoes ? ` | Condições: ${s.condicoes}` : ""}`)
        .join("\n")
    : "(nenhum serviço cadastrado: NÃO informe preços; diga que a equipe vai enviar a proposta e transfira)";
  const conhecimento = ctx.trechos.length ? ctx.trechos.map((t) => `### ${t.titulo} [${t.categoria}]\n${t.conteudo}`).join("\n\n") : "(nenhum trecho relevante encontrado)";
  const lead = ctx.lead
    ? [
        `Empresa: ${ctx.lead.nome}`,
        ctx.lead.segmento && `Segmento: ${ctx.lead.segmento}`,
        ctx.lead.cidade && `Cidade: ${ctx.lead.cidade}`,
        ctx.lead.diagnostico,
      ]
        .filter(Boolean)
        .join("\n")
    : "Contato sem cadastro de empresa.";
  return [
    cfg.instrucoes,
    identidade,
    regrasFixas(cfg.iaFechaVenda),
    COMO_USAR_DIAGNOSTICO,
    `## SERVIÇOS\n${servicos}`,
    `## BASE DE CONHECIMENTO (use para argumentar; não copie literalmente)\n${conhecimento}`,
    `## LEAD (diagnóstico da empresa do cliente)\n${lead}`,
    `## ESTADO DA NEGOCIAÇÃO\nEtapa atual: ${ctx.etapa}. Objeções já levantadas: ${ctx.objecoes.join("; ") || "nenhuma"}.`,
    cfg.iaFechaVenda && ctx.fechamento ? `## FECHAMENTO (dados para o contrato)\n${ctx.fechamento}` : null,
  ]
    .filter(Boolean)
    .join("\n\n");
}

/** Agente simulado (sem chave de IA): reage a palavras-chave usando os dados reais do painel. */
export function decisaoSimulada(ultima: string, ctx: Contexto): Decisao {
  const t = ultima.toLowerCase();
  const base = { objecoes_novas: [] as string[], transferir: false, motivo_transferencia: null, enviar_contrato: false };
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
  const ctx: Contexto = {
    lead: conversa.lead
      ? {
          nome: conversa.lead.nome,
          segmento: conversa.lead.segmento,
          cidade: conversa.lead.cidade,
          diagnostico: diagnosticoParaAgente(diagnosticar(conversa.lead)),
        }
      : null,
    servicos,
    trechos,
    objecoes: conversa.objecoes ? (JSON.parse(conversa.objecoes) as string[]) : [],
    etapa: conversa.etapaNegociacao,
    fechamento: cfg.iaFechaVenda && conversa.leadId ? await estadoFechamento(conversa.leadId) : null,
  };

  /** Pede a decisão à IA. `nota`: aviso extra (ex.: a resposta anterior foi bloqueada e por quê). */
  async function decidir(nota?: string): Promise<Decisao> {
    const r = await chamarIA({
      operacao: "agente",
      sistema: montarSistema(cfg, ctx) + (nota ? `\n\n${nota}` : ""),
      mensagens: historico.map((m) => ({ papel: m.direcao === "entrada" ? ("user" as const) : ("assistant" as const), conteudo: m.conteudo })),
      json: true,
      refs: { leadId: conversa!.leadId, conversaId },
      respostaMock: (_p: PedidoIA) => JSON.stringify(decisaoSimulada(ultima.conteudo, ctx)),
    });
    try {
      const dec = esquemaDecisao.parse(lerJsonIA(r.texto));
      if (dec.resposta) dec.resposta = paraWhatsApp(dec.resposta); // **negrito** -> *negrito* (formato do WhatsApp)
      return dec;
    } catch (e) {
      // Guarda o que a IA devolveu para dar para entender o problema depois.
      await registrarLog("erro", "agente", `Resposta da IA ilegível: ${r.texto.slice(0, 600)}`, { leadId: conversa!.leadId });
      throw e;
    }
  }
  let d = await decidir();
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

  // IA fecha a venda: guarda os dados do contrato que o cliente informou nesta mensagem.
  const iaFecha = cfg.iaFechaVenda && !!conversa.leadId;
  if (iaFecha && d.fechamento && Object.values(d.fechamento).some((v) => v != null && v !== "")) {
    await aplicarFechamento(conversa.leadId!, d.fechamento, servicos);
  }

  // Regras de transferência configuráveis + verificação da resposta pelo código.
  // Com a IA fechando a venda, aceite, desconto e objeções ficam com ela: só transfere se o cliente pedir
  // uma pessoa ou se for algo que ela não sabe (ex.: orçamento sob consulta).
  let motivo: string | null = null;
  if (d.intencao === "aceite" && cfgT.aoAceitarProposta && !iaFecha) motivo = d.motivo_transferencia ?? "Cliente quer avançar para a formalização.";
  else if (d.intencao === "pedido_humano" && cfgT.aoPedirHumano) motivo = d.motivo_transferencia ?? "Cliente pediu atendimento humano.";
  else if (d.intencao === "desconto_acima_limite" && cfgT.aoPedirDescontoAcimaDoLimite && !iaFecha) motivo = d.motivo_transferencia ?? "Pedido de desconto acima do limite autorizado.";
  // "nao_sei" só transfere se a IA pediu (transferir=true): a etiqueta sozinha não é confiável (ela marca
  // "nao_sei" até quando responde normalmente) e transferia conversas que estavam indo bem.
  else if (d.intencao === "nao_sei" && cfgT.aoNaoSaberResponder && d.transferir) motivo = d.motivo_transferencia ?? "O agente não tinha informação para responder.";
  else if (objecoes.length >= cfgT.maxObjecoes && !iaFecha) motivo = `Muitas objeções (${objecoes.length}): melhor uma pessoa assumir.`;
  else if (d.transferir && (!iaFecha || d.intencao === "pedido_humano" || d.intencao === "nao_sei")) motivo = d.motivo_transferencia ?? "Transferência sugerida pelo agente.";

  if (!motivo && d.resposta) {
    let v = verificarResposta(d.resposta, servicos);
    if (!v.ok) {
      // Bloqueada: registra e dá UMA nova chance à IA, explicando o motivo. Só transfere se errar de novo.
      await db.mensagem.create({ data: { conversaId, direcao: "saida", autor: "agente", conteudo: d.resposta, status: "bloqueada", erro: v.motivo } });
      await registrarLog("aviso", "agente", `Resposta bloqueada (vai tentar de novo): ${v.motivo}`, { leadId: conversa.leadId });
      const nova = await decidir(
        `ATENÇÃO: sua resposta anterior foi BLOQUEADA pela verificação: ${v.motivo} Reescreva respeitando as REGRAS (só preços e descontos permitidos, sem prometer resultados). Mantenha o mesmo objetivo da resposta.`,
      );
      v = nova.resposta ? verificarResposta(nova.resposta, servicos) : { ok: false, motivo: "Resposta vazia." };
      if (v.ok) d = { ...nova, fechamento: d.fechamento ?? nova.fechamento };
      else {
        motivo = `Resposta do agente bloqueada pela verificação: ${v.motivo}`;
        if (nova.resposta) await db.mensagem.create({ data: { conversaId, direcao: "saida", autor: "agente", conteudo: nova.resposta, status: "bloqueada", erro: v.motivo } });
        await registrarLog("aviso", "agente", motivo, { leadId: conversa.leadId });
      }
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

  // Cliente confirmou e os dados estão completos: a IA gera e envia o contrato (link) pelo WhatsApp.
  if (iaFecha && d.enviar_contrato) {
    try {
      const r = await enviarContratoPelaIa(conversa.leadId!);
      if (!r.enviado) await registrarLog("info", "agente", `IA quis enviar o contrato, mas falta: ${r.falta.join(", ")}.`, { leadId: conversa.leadId });
    } catch (e) {
      await registrarLog("erro", "agente", `Falha ao enviar o contrato pela IA: ${(e as Error).message}`, { leadId: conversa.leadId });
    }
  }
  if (d.intencao === "sem_interesse") {
    // Encerrada (não desligada para sempre): se o cliente voltar a escrever, o agente retoma.
    await db.conversa.update({ where: { id: conversaId }, data: { status: "encerrada" } });
    if (conversa.leadId) await db.interacaoLead.create({ data: { leadId: conversa.leadId, tipo: "agente", descricao: "Cliente sem interesse; o agente encerrou sem insistir (retoma se o cliente voltar a escrever)." } });
  }
  await emitir("lead.atualizado", { id: conversa.leadId });
  return { acao: "respondida" };
}
