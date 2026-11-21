// Qualificação por IA. A IA recebe SÓ os fatos coletados (sem a internet) e deve separar fatos de hipóteses.
// Score final = combinação transparente da pontuação por regras com a nota da IA (peso configurável).

import { z } from "zod";
import { obterConfig } from "../config";
import { idEtapa, moverSeAutomatica } from "../crm/etapas";
import { db } from "../db";
import { emitir } from "../eventos";
import { chamarIA, lerJsonIA } from "../ia/servico";
import { detalharPontuacao } from "../pontuacao";
import { PRESENCA_ROTULO, type Presenca } from "../tipos";
import { siteComProblemas, type AvaliacaoSite } from "./avaliacaoSite";

const item = z.object({
  descricao: z.string().min(3).max(400),
  tipo: z.enum(["fato", "hipotese"]),
  evidencia: z.string().max(400).optional().nullable(),
});

export const esquemaQualificacao = z.object({
  score: z.number().min(0).max(100),
  justificativa: z.string().min(10).max(1500),
  problemas: z.array(item).max(12).default([]),
  oportunidades: z.array(item).max(12).default([]),
  confianca: z.enum(["baixa", "media", "alta"]),
});

export type QualificacaoIA = z.infer<typeof esquemaQualificacao>;

export interface Qualificacao extends QualificacaoIA {
  scoreIa: number;
  scoreRegra: number;
  regra: Array<{ motivo: string; pontos: number }>;
  provedor: string;
  modelo: string;
  simulado: boolean;
}

const SISTEMA = `Você é um analista comercial que avalia se uma empresa é uma boa oportunidade para a venda de um SITE INSTITUCIONAL.
Regras obrigatórias:
- Use SOMENTE os fatos fornecidos no JSON. Não invente dados, avaliações, número de clientes, faturamento ou problemas.
- Classifique cada problema e oportunidade como "fato" (observado nos dados, cite a evidência) ou "hipotese" (inferência plausível, deixe claro que é suposição).
- "Sem site identificado" significa que as fontes consultadas não mostraram um site; NÃO afirme que a empresa não tem site. Considere o nível de confiança informado.
- Não prometa resultados. Seja objetivo.
- score de 0 a 100: quanto maior, maior a chance de a empresa precisar e se interessar por um site institucional.
- confianca: "baixa" se há poucos dados, "media" ou "alta" se os dados são suficientes.
Responda apenas um objeto JSON: {"score": number, "justificativa": string, "problemas": [{"descricao": string, "tipo": "fato"|"hipotese", "evidencia": string|null}], "oportunidades": [mesmo formato], "confianca": "baixa"|"media"|"alta"}`;

type LeadQualificar = NonNullable<Awaited<ReturnType<typeof carregar>>>;

async function carregar(id: string) {
  return db.lead.findUnique({ where: { id } });
}

export function fatosDoLead(l: LeadQualificar) {
  const avaliacao = l.siteAvaliacao ? (JSON.parse(l.siteAvaliacao) as AvaliacaoSite) : null;
  return {
    empresa: l.nome,
    segmento: l.segmento,
    categoria_na_fonte: l.categoria,
    cidade: l.cidade,
    presenca_web: PRESENCA_ROTULO[l.presenca as Presenca] ?? l.presenca,
    confianca_da_presenca: l.presencaConfianca,
    site: l.website,
    avaliacao_do_site: avaliacao
      ? {
          online: avaliacao.online,
          https: avaliacao.https,
          motivo_fora_do_ar: avaliacao.motivoFora ?? null,
          verificacoes: avaliacao.verificacoes.map((v) => ({ item: v.rotulo, resultado: v.ok === null ? "não verificado" : v.ok ? "ok" : "problema", detalhe: v.detalhe ?? null })),
        }
      : null,
    tem_telefone: !!l.telefoneE164,
    telefone_celular: l.ehCelular,
    whatsapp_identificado: !!l.whatsappE164,
    tem_email: !!l.emails,
    instagram: !!l.instagram,
    facebook: !!l.facebook,
    outras_redes: l.outrasRedes ? Object.keys(JSON.parse(l.outrasRedes) as object) : [],
  };
}

/** Resposta do provedor simulado: deriva tudo dos fatos, sem inventar. */
function respostaSimulada(l: LeadQualificar, regra: ReturnType<typeof detalharPontuacao>): string {
  const avaliacao = l.siteAvaliacao ? (JSON.parse(l.siteAvaliacao) as AvaliacaoSite) : null;
  const problemas: QualificacaoIA["problemas"] = [];
  if (l.presenca === "sem_site_identificado") {
    problemas.push({ descricao: "Nenhum site foi identificado nas fontes consultadas", tipo: "fato", evidencia: `Confiança da identificação: ${l.presencaConfianca}` });
  }
  if (l.presenca === "so_rede_social") problemas.push({ descricao: "O link de site informado é um perfil de rede social", tipo: "fato", evidencia: l.website });
  for (const p of avaliacao?.problemas ?? []) problemas.push({ descricao: p, tipo: "fato", evidencia: avaliacao?.urlFinal ?? l.website });
  const oportunidades: QualificacaoIA["oportunidades"] =
    l.presenca === "com_site"
      ? [{ descricao: "Reformular o site atual corrigindo os problemas verificados", tipo: "hipotese", evidencia: null }]
      : [{ descricao: "Um site institucional próprio pode centralizar serviços, contato e localização", tipo: "hipotese", evidencia: null }];
  return JSON.stringify({
    score: regra.total,
    justificativa: `[Análise simulada, sem IA real] Baseada nas regras: ${regra.itens.map((i) => `${i.motivo} (${i.pontos >= 0 ? "+" : ""}${i.pontos})`).join("; ")}.`,
    problemas,
    oportunidades,
    confianca: "baixa",
  });
}

export async function qualificarLead(leadId: string, buscaId?: string | null): Promise<Qualificacao> {
  const l = await carregar(leadId);
  if (!l) throw new Error("Lead não encontrado.");
  const [pesos, cfg] = await Promise.all([obterConfig("pesos"), obterConfig("prospeccao")]);
  const avaliacao = l.siteAvaliacao ? (JSON.parse(l.siteAvaliacao) as AvaliacaoSite) : null;
  const regra = detalharPontuacao({ ...l, presenca: l.presenca as Presenca, siteComProblemas: siteComProblemas(avaliacao) }, pesos);

  await db.lead.update({ where: { id: leadId }, data: { qualificacaoStatus: "analisando", pontuacaoRegra: regra.total } });
  await moverSeAutomatica(leadId, "em_analise");

  try {
    const r = await chamarIA({
      operacao: "qualificacao",
      sistema: SISTEMA,
      mensagens: [{ papel: "user", conteudo: JSON.stringify(fatosDoLead(l)) }],
      json: true,
      temperatura: 0.2,
      refs: { leadId, buscaId },
      respostaMock: () => respostaSimulada(l, regra),
    });
    const ia = esquemaQualificacao.parse(lerJsonIA(r.texto));
    const scoreIa = Math.round(ia.score);
    const score = Math.round(regra.total * (1 - cfg.pesoIaPct / 100) + scoreIa * (cfg.pesoIaPct / 100));
    const q: Qualificacao = { ...ia, score, scoreIa, scoreRegra: regra.total, regra: regra.itens, provedor: r.provedor, modelo: r.modelo, simulado: r.simulado };
    const qualificado = !l.naoContatar && score >= cfg.scoreMinimoQualificado;

    await db.lead.update({
      where: { id: leadId },
      data: {
        score,
        qualificacao: JSON.stringify(q),
        qualificacaoStatus: qualificado ? "qualificado" : "desqualificado",
        qualificadoEm: new Date(),
      },
    });
    if (qualificado) await moverSeAutomatica(leadId, "qualificado");
    else {
      // Baixo potencial volta para "Novo lead" (só se a automação ainda é dona do cartão).
      const emAnalise = await idEtapa("em_analise");
      await db.lead.updateMany({ where: { id: leadId, etapaId: emAnalise }, data: { etapaId: await idEtapa("novo") } });
    }
    await db.interacaoLead.create({
      data: { leadId, tipo: "qualificacao", descricao: `Qualificação ${r.simulado ? "simulada" : `por IA (${r.modelo})`}: score ${score} (${qualificado ? "qualificado" : "baixo potencial"}).` },
    });
    await emitir("lead.atualizado", { id: leadId, buscaId });
    return q;
  } catch (e) {
    await db.lead.update({ where: { id: leadId }, data: { qualificacaoStatus: "erro", score: l.score ?? regra.total } });
    await emitir("lead.atualizado", { id: leadId, buscaId });
    throw e;
  }
}
