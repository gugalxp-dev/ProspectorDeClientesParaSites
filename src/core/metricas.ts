// Indicadores do dashboard, sempre calculados do banco (nada simulado).

import { idEtapa } from "./crm/etapas";
import { db } from "./db";
import { siteComProblemas, type AvaliacaoSite } from "./prospeccao/avaliacaoSite";

export async function metricas() {
  const [intervencao, fechado, negociacao] = await Promise.all([idEtapa("intervencao_humana"), idEtapa("fechado"), idEtapa("em_negociacao")]);
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const mes = new Date(hoje);
  mes.setDate(1);

  const [
    pesquisasAtivas,
    empresas,
    analisadas,
    qualificadas,
    semSite,
    foraDoAr,
    comSite,
    autorizados,
    enviadas,
    entregues,
    lidas,
    conversasRespondidas,
    emNegociacao,
    aguardandoHumano,
    fechados,
    falhasJobs,
    falhasEnvio,
    custoMes,
    custoHoje,
    notificacoes,
    prontos,
    contatados,
    descartados,
  ] = await Promise.all([
    db.busca.count({ where: { status: { in: ["pendente", "descobrindo", "processando"] } } }),
    db.lead.count(),
    db.lead.count({ where: { qualificacaoStatus: { in: ["qualificado", "desqualificado"] } } }),
    db.lead.count({ where: { qualificacaoStatus: "qualificado" } }),
    db.lead.count({ where: { presenca: { in: ["sem_site_identificado", "so_rede_social"] } } }),
    db.lead.count({ where: { presenca: "site_fora_do_ar" } }),
    db.lead.findMany({ where: { presenca: "com_site", siteAvaliacao: { not: null } }, select: { siteAvaliacao: true } }),
    db.lead.count({ where: { contatoStatus: "autorizado" } }),
    db.mensagem.count({ where: { direcao: "saida", status: { in: ["enviada", "entregue", "lida"] } } }),
    db.mensagem.count({ where: { direcao: "saida", status: { in: ["entregue", "lida"] } } }),
    db.mensagem.count({ where: { direcao: "saida", status: "lida" } }),
    db.conversa.count({ where: { mensagens: { some: { direcao: "entrada" } } } }),
    db.lead.count({ where: { etapaId: negociacao } }),
    db.lead.count({ where: { etapaId: intervencao } }),
    db.lead.count({ where: { etapaId: fechado } }),
    db.job.count({ where: { status: "falhou" } }),
    db.mensagem.count({ where: { direcao: "saida", status: "falhou" } }),
    db.registroCusto.aggregate({ _sum: { custoUsd: true }, where: { criadoEm: { gte: mes } } }),
    db.registroCusto.aggregate({ _sum: { custoUsd: true }, where: { criadoEm: { gte: hoje } } }),
    db.notificacao.count({ where: { lidaEm: null } }),
    db.lead.count({ where: { qualificacaoStatus: "qualificado", naoContatar: false, conversa: { is: null }, OR: [{ telefoneE164: { not: null } }, { whatsappE164: { not: null } }] } }),
    db.conversa.count({ where: { mensagens: { some: { direcao: "saida" } } } }),
    db.logOperacao.count({ where: { etapa: "filtro" } }),
  ]);

  const siteDeficiente = comSite.filter((l) => siteComProblemas(JSON.parse(l.siteAvaliacao!) as AvaliacaoSite)).length;

  return {
    pesquisasAtivas,
    empresas,
    analisadas,
    qualificadas,
    semSite,
    siteDeficiente: siteDeficiente + foraDoAr,
    autorizados,
    enviadas,
    entregues,
    lidas,
    conversasRespondidas,
    emNegociacao,
    aguardandoHumano,
    fechados,
    falhas: falhasJobs + falhasEnvio,
    custoMesUsd: custoMes._sum.custoUsd ?? 0,
    custoHojeUsd: custoHoje._sum.custoUsd ?? 0,
    notificacoesNaoLidas: notificacoes,
    prontos,
    contatados,
    descartados,
    /** % das conversas iniciadas em que o cliente respondeu. */
    taxaResposta: contatados ? Math.round((conversasRespondidas / contatados) * 100) : null,
    /** % das conversas iniciadas que viraram negócio fechado. */
    taxaConversao: contatados ? Math.round((fechados / contatados) * 100) : null,
    geradoEm: new Date().toISOString(),
  };
}

export type Metricas = Awaited<ReturnType<typeof metricas>>;
