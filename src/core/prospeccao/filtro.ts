// Filtro da prospecção: só entra no CRM (e na análise por IA) quem faz sentido prospectar.
// 1) Na importação (antes de registrar): ignora redes/franquias e quem não tem celular nem site para procurar um.
// 2) Depois de visitar o site de verdade (crawler): apaga quem não tem celular/WhatsApp ou já tem site bom.
// Enquanto não passa pelo filtro, o lead fica sem etapa (invisível no CRM). Quem não passa é apagado.
// As exclusões ficam só no log (etapa "filtro"), para a pesquisa mostrar quantas foram ignoradas.

import { obterConfig, type ConfigDe } from "../config";
import { ETAPAS_AUTOMATICAS, idEtapa, moverSeAutomatica } from "../crm/etapas";
import { db } from "../db";
import { emitir, registrarLog } from "../eventos";
import { semAcento } from "../fontes/osm";
import { verificarWhatsApp } from "../whatsapp/cliente";
import { siteComProblemas, type AvaliacaoSite } from "./avaliacaoSite";

type CfgFiltro = Pick<ConfigDe<"prospeccao">, "exigirCelular" | "descartarComSiteBom" | "ignorarRedes" | "redesIgnoradas">;

const simples = (t: string) => ` ${semAcento(t).replace(/['’´`]/g, "").replace(/[^a-z0-9]+/g, " ").trim()} `;

/** "McDonald's Guarujá" casa com "McDonald's"; compara palavras inteiras, sem acento e pontuação. */
export function ehRede(nome: string, lista: string[]): boolean {
  const n = simples(nome);
  return lista.some((r) => r.trim() && n.includes(simples(r)));
}

/** Motivo para ignorar antes de registrar (sem nenhuma chamada externa), ou null. */
export function motivoIgnorarNaImportacao(l: { nome: string; rede?: string; ehCelular: boolean; temSite: boolean }, cfg: CfgFiltro): string | null {
  if (cfg.ignorarRedes && (l.rede || ehRede(l.nome, cfg.redesIgnoradas))) return `Rede/franquia${l.rede ? ` (${l.rede})` : ""}.`;
  // Sem celular e sem site onde procurar um: não há como chamar no WhatsApp.
  if (cfg.exigirCelular && !l.ehCelular && !l.temSite) return "Sem celular/WhatsApp e sem site para procurar um.";
  return null;
}

/** Motivo para apagar depois da visita ao site, ou null se segue para a análise. */
export function motivoDescarte(
  l: { nome: string; presenca: string; siteAvaliacao: string | null; ehCelular: boolean; whatsappE164: string | null },
  cfg: CfgFiltro,
): string | null {
  if (cfg.ignorarRedes && ehRede(l.nome, cfg.redesIgnoradas)) return "Rede/franquia.";
  if (cfg.exigirCelular && !l.ehCelular && !l.whatsappE164) return "Sem celular ou WhatsApp (fixo sem WhatsApp, ou nenhum telefone).";
  if (cfg.descartarComSiteBom && l.presenca === "com_site") {
    const avaliacao = l.siteAvaliacao ? (JSON.parse(l.siteAvaliacao) as AvaliacaoSite) : null;
    if (avaliacao?.online && !siteComProblemas(avaliacao)) return "Já tem site no ar, sem problemas técnicos.";
  }
  return null;
}

/** Lead ainda intocado: nunca contatado e só em etapas automáticas (ninguém mexeu nele). */
export async function intocado(l: { contatoStatus: string; etapaId: string | null; conversa: { id: string } | null }): Promise<boolean> {
  if (l.conversa || l.contatoStatus !== "sem_autorizacao") return false;
  if (!l.etapaId) return true;
  return (await Promise.all(ETAPAS_AUTOMATICAS.map(idEtapa))).includes(l.etapaId);
}

/**
 * Depois da visita ao site. Se não serve, apaga o lead e devolve true.
 * Se serve, coloca no CRM ("Novo lead") e devolve false.
 */
export async function aplicarFiltro(leadId: string, buscaId?: string | null): Promise<boolean> {
  const [l, cfg] = await Promise.all([db.lead.findUnique({ where: { id: leadId }, include: { conversa: { select: { id: true } } } }), obterConfig("prospeccao")]);
  if (!l) return true;
  if (!(await intocado(l))) return false;
  // Ficou só com fixo (nem a fonte nem o site trouxeram celular): pergunta ao WhatsApp antes de descartar.
  if (cfg.exigirCelular && !l.ehCelular && !l.whatsappE164 && l.telefoneE164 && (await verificarWhatsApp(l.telefoneE164))) {
    await db.lead.update({ where: { id: leadId }, data: { whatsappE164: l.telefoneE164 } });
    l.whatsappE164 = l.telefoneE164;
  }
  const motivo = motivoDescarte(l, cfg);
  if (!motivo) {
    if (!l.etapaId) await moverSeAutomatica(leadId, "novo");
    return false;
  }
  await db.registroCusto.updateMany({ where: { leadId }, data: { leadId: null } });
  await db.lead.delete({ where: { id: leadId } });
  await registrarLog("info", "filtro", `${l.nome}: ignorado (${motivo})`, { buscaId });
  await emitir("lead.atualizado", { id: leadId, removido: true });
  return true;
}
