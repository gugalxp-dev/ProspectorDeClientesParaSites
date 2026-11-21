// Procura o site oficial de uma empresa que veio SEM site da fonte, sem usar buscadores:
// testa domínios prováveis derivados do nome (DNS primeiro, depois a página inicial) e só aceita
// se a página confirmar o nome E (a cidade OU o telefone). Assim "sem site" não depende de uma única fonte,
// e um domínio de outra empresa com nome parecido não é atribuído por engano.

import { resolve4, resolve6 } from "node:dns/promises";
import { USER_AGENT } from "../http-cliente";
import { semAcento } from "../fontes/osm";
import { dominioRegistravel, hostDe } from "../presenca";

const GENERICOS = new Set(["pet", "shop", "loja", "casa", "centro", "clinica", "salao", "bar", "restaurante", "studio", "espaco", "de", "da", "do", "das", "dos", "e", "the"]);

export function slugs(nome: string, cidade?: string | null): string[] {
  const palavras = semAcento(nome)
    .replace(/\b(ltda|me|eireli|epp|s\/?a)\b/g, " ")
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  if (!palavras.length) return [];
  const junto = palavras.join("");
  const significativas = palavras.filter((p) => !GENERICOS.has(p));
  // Nome só com palavras genéricas ("Pet Shop Center") gera domínio de outra pessoa: não arrisca.
  if (!significativas.length || junto.length < 4) return [];
  const c = cidade ? semAcento(cidade).replace(/[^a-z]/g, "") : "";
  const base = [junto, palavras.join("-"), ...(c ? [`${junto}${c}`] : [])];
  return [...new Set(base)].filter((s) => s.length <= 40).flatMap((s) => [`${s}.com.br`, `${s}.com`]).slice(0, 5);
}

async function existe(dominio: string): Promise<boolean> {
  try {
    const r = await Promise.any([resolve4(dominio), resolve6(dominio)]);
    return r.length > 0;
  } catch {
    return false;
  }
}

export interface SiteEncontrado {
  url: string;
  evidencia: string;
  /** false = a página cita o nome, mas não a cidade nem o telefone: fica só como "possível site". */
  confirmado: boolean;
}

let fetchTeste: typeof fetch | null = null;
let dnsTeste: ((d: string) => Promise<boolean>) | null = null;
/** Só para testes. */
export function definirRedeDescobertaSite(f: typeof fetch | null, dns: ((d: string) => Promise<boolean>) | null): void {
  fetchTeste = f;
  dnsTeste = dns;
}

export async function descobrirSite(l: { nome: string; cidade: string | null; telefoneE164: string | null }, timeoutMs = 8000): Promise<SiteEncontrado | null> {
  const tokens = semAcento(l.nome)
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 3 && !GENERICOS.has(t));
  const cidade = l.cidade ? semAcento(l.cidade.split(",")[0]) : null;
  const tel = l.telefoneE164?.replace(/\D/g, "").slice(-8) ?? null;

  let possivel: SiteEncontrado | null = null;
  for (const dominio of slugs(l.nome, l.cidade)) {
    if (!(await (dnsTeste ?? existe)(dominio))) continue;
    try {
      const r = await (fetchTeste ?? fetch)(`https://${dominio}`, {
        headers: { "User-Agent": USER_AGENT, Accept: "text/html" },
        redirect: "follow",
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!r.ok || !(r.headers.get("content-type") ?? "").includes("html")) continue;
      // Redirecionou para outro domínio (domínio à venda, estacionado, de terceiros): não é o site da empresa.
      if (r.url && dominioRegistravel(hostDe(r.url)) !== dominioRegistravel(dominio)) continue;
      const html = (await r.text()).slice(0, 300_000);
      const texto = semAcento(html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<[^>]+>/g, " "));
      const temNome = tokens.length > 0 && tokens.every((t) => texto.includes(t));
      const temCidade = !!cidade && texto.includes(cidade);
      const temTel = !!tel && texto.replace(/\D/g, "").includes(tel);
      if (temNome && (temCidade || temTel)) {
        return { url: r.url || `https://${dominio}`, evidencia: `Domínio ${dominio}: a página cita o nome e ${temTel ? "o telefone" : "a cidade"}.`, confirmado: true };
      }
      if (temNome && !possivel) possivel = { url: r.url || `https://${dominio}`, evidencia: `Domínio ${dominio} cita o nome, mas não a cidade nem o telefone.`, confirmado: false };
    } catch {
      // domínio sem HTTPS, fora do ar etc.: tenta o próximo
    }
  }
  return possivel;
}
