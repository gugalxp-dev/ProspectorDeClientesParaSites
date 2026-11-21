// Enriquecimento de um lead: crawler + scraper + avaliação do site + pontuação por regras.
// Só preenche dados ausentes; tudo que vem do site é registrado com a URL de origem.

import { obterConfig } from "../config";
import { moverSeAutomatica } from "../crm/etapas";
import { db } from "../db";
import { emitir, registrarLog } from "../eventos";
import { calcularPontuacao } from "../pontuacao";
import { classificarWebsite, dominioRegistravel, hostDe } from "../presenca";
import { normalizarTelefone } from "../telefone";
import type { Presenca } from "../tipos";
import { avaliarSite, siteComProblemas } from "./avaliacaoSite";
import { rastrearSite, type OpcoesCrawler } from "./crawler";
import { descobrirSite } from "./descobrirSite";
import { registrarDados } from "./importar";
import { extrairDadosSite } from "./scraper";

export async function processarLead(leadId: string, buscaId?: string | null, opcoes: { fetch?: typeof fetch; forcar?: boolean } = {}) {
  let l = await db.lead.findUnique({ where: { id: leadId } });
  if (!l) return;
  const [cfg, pesos] = await Promise.all([obterConfig("prospeccao"), obterConfig("pesos")]);
  await moverSeAutomatica(leadId, "em_analise");

  // Fonte sem site: tenta achar o oficial antes de concluir "sem site".
  if (!l.website && cfg.inferirSite && (!l.siteAvaliadoEm || opcoes.forcar)) {
    const achado = await descobrirSite(l, cfg.crawler.timeoutMs);
    if (achado?.confirmado) {
      l = await db.lead.update({
        where: { id: leadId },
        data: { website: achado.url, dominio: dominioRegistravel(hostDe(achado.url)), presenca: "com_site", presencaConfianca: "media" },
      });
      await registrarDados(leadId, "dominio_inferido", achado.url, { website: achado.url });
      await registrarLog("info", "crawler", `${l.nome}: site oficial encontrado (${achado.evidencia})`, { buscaId, leadId });
    } else if (achado) {
      await registrarDados(leadId, "dominio_inferido", achado.url, { site_possivel: `${achado.url} (não confirmado: ${achado.evidencia})` });
    }
    if (!achado?.confirmado) await db.lead.update({ where: { id: leadId }, data: { siteAvaliadoEm: new Date() } });
  }

  const recente = l.siteAvaliadoEm && Date.now() - l.siteAvaliadoEm.getTime() < cfg.reverificarSiteAposDias * 86_400_000;
  const precisaVisitar = !!l.website && classificarWebsite(l.website).presenca === "com_site" && (!recente || opcoes.forcar);

  if (precisaVisitar) {
    const o: OpcoesCrawler = {
      profundidade: cfg.crawler.profundidade,
      maxPaginas: cfg.crawler.maxPaginasPorSite,
      timeoutMs: cfg.crawler.timeoutMs,
      atrasoPorHostMs: cfg.crawler.atrasoPorHostMs,
      respeitarRobots: cfg.crawler.respeitarRobots,
      fetch: opcoes.fetch,
    };
    const crawl = await rastrearSite(l.website!, o);
    const dados = extrairDadosSite(crawl.paginas, l.website!);
    const avaliacao = avaliarSite(crawl, dados);
    const presenca: Presenca = avaliacao.online ? "com_site" : "site_fora_do_ar";

    const telSite = dados.telefones.map((t) => normalizarTelefone(t.valor)).find((t) => t.e164);
    const whatsapp = dados.whatsapps[0]?.valor ?? null;
    const emails = l.emails ?? (dados.emails.length ? dados.emails.map((e) => e.valor).join(", ") : null);
    const outras = Object.fromEntries(Object.entries(dados.outrasRedes).map(([k, v]) => [k, v.valor]));
    const atualizado = {
      presenca,
      presencaConfianca: "alta",
      siteAvaliacao: JSON.stringify(avaliacao),
      siteAvaliadoEm: new Date(),
      telefoneE164: l.telefoneE164 ?? telSite?.e164 ?? null,
      ehCelular: l.telefoneE164 ? l.ehCelular : (telSite?.ehCelular ?? false),
      whatsappE164: l.whatsappE164 ?? whatsapp,
      emails,
      endereco: l.endereco ?? dados.endereco?.valor ?? null,
      instagram: l.instagram ?? dados.instagram?.valor ?? null,
      facebook: l.facebook ?? dados.facebook?.valor ?? null,
      linkedin: l.linkedin ?? dados.linkedin?.valor ?? null,
      outrasRedes: Object.keys(outras).length ? JSON.stringify({ ...(l.outrasRedes ? JSON.parse(l.outrasRedes) : {}), ...outras }) : l.outrasRedes,
    };
    await db.lead.update({
      where: { id: leadId },
      data: {
        ...atualizado,
        pontuacaoRegra: calcularPontuacao({ ...l, ...atualizado, presenca, siteComProblemas: siteComProblemas(avaliacao) }, pesos),
      },
    });

    // Proveniência: cada dado com a página exata onde foi encontrado.
    for (const t of dados.telefones) await registrarDados(leadId, "site", t.url, { telefone: t.valor });
    for (const w of dados.whatsapps) await registrarDados(leadId, "site", w.url, { whatsapp: w.valor });
    for (const e of dados.emails) await registrarDados(leadId, "site", e.url, { email: e.valor });
    for (const [campo, d] of Object.entries({ nome: dados.nome, endereco: dados.endereco, instagram: dados.instagram, facebook: dados.facebook, linkedin: dados.linkedin })) {
      if (d) await registrarDados(leadId, "site", d.url, { [campo]: d.valor });
    }
    for (const [rede, d] of Object.entries(dados.outrasRedes)) await registrarDados(leadId, "site", d.url, { [rede]: d.valor });

    if (!avaliacao.online) await registrarLog("info", "crawler", `${l.nome}: ${avaliacao.motivoFora}`, { buscaId, leadId });
    if (crawl.bloqueadoPorRobots) await registrarLog("info", "crawler", `${l.nome}: robots.txt não permite análise do conteúdo.`, { buscaId, leadId });
  } else {
    await db.lead.update({
      where: { id: leadId },
      data: { pontuacaoRegra: calcularPontuacao({ ...l, presenca: l.presenca as Presenca }, pesos) },
    });
  }
  await emitir("lead.atualizado", { id: leadId, buscaId });
}
