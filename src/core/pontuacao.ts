// Pontuação por regras (0 a 100), transparente e configurável em Admin > Prospecção.
// É a base do score; a IA complementa com a análise qualitativa. Cada ponto tem um motivo listado.

import type { ConfigDe } from "./config";
import type { Presenca } from "./tipos";

export type Pesos = ConfigDe<"pesos">;

export const PESOS_PADRAO: Pesos = {
  semSite: 35,
  soRedeSocial: 30,
  siteForaDoAr: 30,
  siteComProblemas: 20,
  comSite: 0,
  celular: 20,
  email: 5,
  redeSocial: 10,
};

export interface DadosPontuacao {
  presenca: Presenca;
  siteComProblemas?: boolean;
  ehCelular: boolean;
  emails?: string | null;
  instagram?: string | null;
  facebook?: string | null;
  naoContatar?: boolean;
}

export interface ItemPontuacao {
  motivo: string;
  pontos: number;
}

export function detalharPontuacao(l: DadosPontuacao, pesos: Pesos = PESOS_PADRAO): { total: number; itens: ItemPontuacao[] } {
  if (l.naoContatar) return { total: 0, itens: [{ motivo: "Pediu para não ser contatado", pontos: 0 }] };
  const itens: ItemPontuacao[] = [];
  const porPresenca: Record<Presenca, [string, number]> = {
    sem_site_identificado: ["Nenhum site identificado", pesos.semSite],
    so_rede_social: ["Usa só rede social, sem site próprio", pesos.soRedeSocial],
    site_fora_do_ar: ["Site fora do ar", pesos.siteForaDoAr],
    com_site: ["Já tem site no ar", pesos.comSite],
  };
  itens.push({ motivo: porPresenca[l.presenca][0], pontos: porPresenca[l.presenca][1] });
  if (l.presenca === "com_site" && l.siteComProblemas) itens.push({ motivo: "Site com problemas técnicos verificados", pontos: pesos.siteComProblemas });
  if (l.ehCelular) itens.push({ motivo: "Telefone celular (possível WhatsApp)", pontos: pesos.celular });
  if (l.emails) itens.push({ motivo: "E-mail comercial encontrado", pontos: pesos.email });
  if (l.instagram || l.facebook) itens.push({ motivo: "Ativo em rede social (presença digital, mas sem canal próprio forte)", pontos: pesos.redeSocial });
  const total = Math.max(0, Math.min(100, Math.round(itens.reduce((s, i) => s + i.pontos, 0))));
  return { total, itens: itens.filter((i) => i.pontos !== 0 || i.motivo.startsWith("Já tem")) };
}

export function calcularPontuacao(l: DadosPontuacao, pesos: Pesos = PESOS_PADRAO): number {
  return detalharPontuacao(l, pesos).total;
}
