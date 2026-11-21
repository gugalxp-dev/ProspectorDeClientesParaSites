// Scraper: extrai dados de contato das páginas visitadas pelo crawler. Só o que está publicado;
// nada é deduzido ou inventado. Cada dado guarda a URL de onde saiu.

import { extrairEmails, extrairRedes } from "../extrair";
import { normalizarTelefone } from "../telefone";
import type { PaginaVisitada } from "./crawler";

export interface DadoExtraido {
  valor: string;
  url: string;
}

export interface DadosSite {
  nome?: DadoExtraido;
  telefones: DadoExtraido[];
  whatsapps: DadoExtraido[];
  emails: DadoExtraido[];
  endereco?: DadoExtraido;
  instagram?: DadoExtraido;
  facebook?: DadoExtraido;
  linkedin?: DadoExtraido;
  outrasRedes: Record<string, DadoExtraido>;
}

const TEL_HREF = /href\s*=\s*["']tel:([^"']+)["']/gi;
const TEL_TEXTO = /(?:\+?55\s?)?\(?\b([1-9]{2})\)?[\s.-]?(9?\d{4})[\s.-]?(\d{4})\b/g;
const WA = /(?:wa\.me\/|api\.whatsapp\.com\/send\/?\?(?:[^"'\s]*&)?phone=|web\.whatsapp\.com\/send\?phone=)\+?(\d{10,13})/gi;
const OUTRAS = {
  tiktok: /https?:\/\/(?:www\.)?tiktok\.com\/@([A-Za-z0-9_.]+)/i,
  youtube: /https?:\/\/(?:www\.)?youtube\.com\/(?:@|channel\/|c\/)([A-Za-z0-9_.\-]+)/i,
  twitter: /https?:\/\/(?:www\.)?(?:twitter|x)\.com\/([A-Za-z0-9_]{2,15})(?=["'/?\s])/i,
};

function textoVisivel(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ");
}

interface JsonLdNegocio {
  name?: string;
  telephone?: string;
  email?: string;
  address?: string | { streetAddress?: string; addressLocality?: string; addressRegion?: string; postalCode?: string };
  sameAs?: string | string[];
}

function lerJsonLd(html: string): JsonLdNegocio[] {
  const out: JsonLdNegocio[] = [];
  for (const m of html.matchAll(/<script[^>]+type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const j = JSON.parse(m[1].trim()) as unknown;
      const itens = (Array.isArray(j) ? j : [j]).flatMap((x) => (x && typeof x === "object" && "@graph" in x ? (x as { "@graph": unknown[] })["@graph"] : [x]));
      for (const it of itens) {
        if (!it || typeof it !== "object") continue;
        const tipo = String((it as { "@type"?: unknown })["@type"] ?? "");
        if (/LocalBusiness|Organization|Store|Restaurant|Dentist|Clinic|Salon|Shop|Service/i.test(tipo)) out.push(it as JsonLdNegocio);
      }
    } catch {
      // JSON-LD inválido: ignora
    }
  }
  return out;
}

function enderecoJsonLd(a: JsonLdNegocio["address"]): string | undefined {
  if (!a) return undefined;
  if (typeof a === "string") return a;
  return [a.streetAddress, a.addressLocality, a.addressRegion, a.postalCode].filter(Boolean).join(", ") || undefined;
}

function addUnico(lista: DadoExtraido[], valor: string, url: string) {
  if (!lista.some((d) => d.valor === valor)) lista.push({ valor, url });
}

export function extrairDadosSite(paginas: PaginaVisitada[], site: string): DadosSite {
  const d: DadosSite = { telefones: [], whatsapps: [], emails: [], outrasRedes: {} };
  for (const p of paginas) {
    if (!p.html) continue;
    const url = p.url;

    for (const e of extrairEmails(p.html, site)) addUnico(d.emails, e, url);

    for (const m of p.html.matchAll(WA)) {
      const t = normalizarTelefone(`+${m[1].startsWith("55") ? m[1] : `55${m[1]}`}`);
      if (t.e164) addUnico(d.whatsapps, t.e164, url);
    }
    for (const m of p.html.matchAll(TEL_HREF)) {
      const t = normalizarTelefone(decodeURIComponent(m[1]));
      if (t.e164) addUnico(d.telefones, t.e164, url);
    }
    for (const m of textoVisivel(p.html).matchAll(TEL_TEXTO)) {
      const t = normalizarTelefone(`${m[1]}${m[2]}${m[3]}`);
      if (t.e164) addUnico(d.telefones, t.e164, url);
    }

    const redes = extrairRedes(p.html);
    if (redes.instagram && !d.instagram) d.instagram = { valor: redes.instagram, url };
    if (redes.facebook && !d.facebook) d.facebook = { valor: redes.facebook, url };
    if (redes.linkedin && !d.linkedin) d.linkedin = { valor: redes.linkedin, url };
    for (const [rede, re] of Object.entries(OUTRAS)) {
      const m = p.html.match(re);
      if (m && !d.outrasRedes[rede]) d.outrasRedes[rede] = { valor: m[0], url };
    }

    for (const n of lerJsonLd(p.html)) {
      if (n.name && !d.nome) d.nome = { valor: n.name.trim(), url };
      if (n.telephone) {
        const t = normalizarTelefone(n.telephone);
        if (t.e164) addUnico(d.telefones, t.e164, url);
      }
      if (n.email) addUnico(d.emails, n.email.replace(/^mailto:/, "").toLowerCase(), url);
      const end = enderecoJsonLd(n.address);
      if (end && !d.endereco) d.endereco = { valor: end, url };
    }
    if (!d.nome) {
      const og = p.html.match(/<meta[^>]+property\s*=\s*["']og:site_name["'][^>]+content\s*=\s*["']([^"']{2,120})["']/i);
      if (og) d.nome = { valor: og[1].trim(), url };
    }
  }
  d.telefones = d.telefones.slice(0, 5);
  d.emails = d.emails.slice(0, 5);
  return d;
}
