// Crawler do site de uma empresa: navega só dentro do mesmo domínio, por largura, priorizando
// páginas de contato/sobre/serviços. Respeita robots.txt, limita profundidade, quantidade de páginas,
// tempo e tamanho, espera entre requisições ao mesmo host e nunca visita a mesma URL duas vezes.
// Não usa navegador, não executa JavaScript e não tenta passar por CAPTCHA ou login.

import { USER_AGENT } from "../http-cliente";
import { dominioRegistravel, hostDe, normalizarUrl } from "../presenca";
import { interpretarRobots, permitido, type Regra } from "./robots";

export interface OpcoesCrawler {
  profundidade: number;
  maxPaginas: number;
  timeoutMs: number;
  atrasoPorHostMs: number;
  respeitarRobots: boolean;
  /** Para testes. */
  fetch?: typeof fetch;
}

export interface PaginaVisitada {
  url: string;
  profundidade: number;
  status: number | null;
  ms: number;
  html: string;
  erro?: string;
  tipo?: string;
}

export interface ResultadoCrawl {
  inicial: string;
  /** URL final da página inicial, depois dos redirecionamentos. */
  urlFinal: string | null;
  paginas: PaginaVisitada[];
  bloqueadoPorRobots: boolean;
  /** https falhou e só http funcionou (certificado inválido ou ausente). */
  certificadoFalhou: boolean;
  erroInicial?: string;
}

const LIMITE_BYTES = 1_000_000;
const EXT_IGNORADAS = /\.(?:jpe?g|png|gif|webp|svg|ico|pdf|zip|rar|mp4|mp3|avi|mov|docx?|xlsx?|pptx?|css|js|json|xml|woff2?|ttf)(?:$|\?)/i;
const PRIORIDADE = /contato|contact|fale|sobre|about|quem-somos|empresa|servi[cç]os|services|atendimento|localiza/i;

const ultimaPorHost = new Map<string, number>();
let fetchPadrao: typeof fetch | null = null;

/** Só para testes: troca o fetch de todo o crawler. */
export function definirFetchCrawler(f: typeof fetch | null): void {
  fetchPadrao = f;
}
const robotsCache = new Map<string, { regras: Regra[]; ate: number }>();

export function normalizarParaVisita(url: string): string | null {
  try {
    const u = new URL(url);
    if (!/^https?:$/.test(u.protocol)) return null;
    u.hash = "";
    u.hostname = u.hostname.toLowerCase();
    // Parâmetros de rastreamento não mudam a página.
    for (const p of [...u.searchParams.keys()]) if (/^(utm_|fbclid|gclid)/i.test(p)) u.searchParams.delete(p);
    let s = u.toString();
    if (s.endsWith("/") && u.pathname !== "/") s = s.slice(0, -1);
    return s;
  } catch {
    return null;
  }
}

async function esperarVez(host: string, atrasoMs: number) {
  const agora = Date.now();
  const proxima = (ultimaPorHost.get(host) ?? 0) + atrasoMs;
  ultimaPorHost.set(host, Math.max(agora, proxima));
  if (proxima > agora) await new Promise((r) => setTimeout(r, proxima - agora));
}

async function baixar(url: string, o: OpcoesCrawler): Promise<Omit<PaginaVisitada, "profundidade"> & { urlFinal: string }> {
  const f = o.fetch ?? fetchPadrao ?? fetch;
  const inicio = Date.now();
  try {
    await esperarVez(hostDe(url), o.atrasoPorHostMs);
    const r = await f(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "text/html,application/xhtml+xml", "Accept-Language": "pt-BR,pt;q=0.9" },
      redirect: "follow",
      signal: AbortSignal.timeout(o.timeoutMs),
    });
    const tipo = r.headers.get("content-type") ?? "";
    let html = "";
    if (tipo.includes("html") && r.body) {
      const leitor = r.body.getReader();
      const partes: Uint8Array[] = [];
      let total = 0;
      while (total < LIMITE_BYTES) {
        const { done, value } = await leitor.read();
        if (done) break;
        partes.push(value);
        total += value.length;
      }
      await leitor.cancel().catch(() => undefined);
      html = new TextDecoder("utf-8", { fatal: false }).decode(Buffer.concat(partes)).slice(0, LIMITE_BYTES);
    } else {
      await r.body?.cancel().catch(() => undefined);
    }
    return { url, urlFinal: r.url || url, status: r.status, ms: Date.now() - inicio, html, tipo };
  } catch (e) {
    const err = e as Error & { cause?: { code?: string } };
    const erro = err.name === "TimeoutError" ? "timeout" : (err.cause?.code ?? err.message);
    return { url, urlFinal: url, status: null, ms: Date.now() - inicio, html: "", erro };
  }
}

async function regrasRobots(origem: string, o: OpcoesCrawler): Promise<Regra[]> {
  if (!o.respeitarRobots) return [];
  const c = robotsCache.get(origem);
  if (c && c.ate > Date.now()) return c.regras;
  // Sem robots.txt (404) ou inacessível = sem restrições, como manda a RFC 9309.
  let regras: Regra[] = [];
  try {
    await esperarVez(hostDe(origem), o.atrasoPorHostMs);
    const f = o.fetch ?? fetchPadrao ?? fetch;
    const r = await f(`${origem}/robots.txt`, { headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(Math.min(o.timeoutMs, 8000)) });
    if (r.ok) regras = interpretarRobots((await r.text()).slice(0, 200_000), "ProspectorDeClientesParaSites");
    else await r.body?.cancel().catch(() => undefined);
  } catch {
    regras = [];
  }
  robotsCache.set(origem, { regras, ate: Date.now() + 3600_000 });
  return regras;
}

export function linksInternos(html: string, base: string): string[] {
  const dominio = dominioRegistravel(hostDe(base));
  const out: string[] = [];
  for (const m of html.matchAll(/<a\s[^>]*?href\s*=\s*["']([^"'#][^"']*)["']/gi)) {
    let abs: string;
    try {
      abs = new URL(m[1].trim(), base).toString();
    } catch {
      continue;
    }
    const n = normalizarParaVisita(abs);
    if (!n || EXT_IGNORADAS.test(n)) continue;
    if (dominioRegistravel(hostDe(n)) !== dominio) continue;
    if (!out.includes(n)) out.push(n);
  }
  // Contato e afins primeiro.
  return out.sort((a, b) => Number(PRIORIDADE.test(b)) - Number(PRIORIDADE.test(a)));
}

export async function rastrearSite(website: string, o: OpcoesCrawler): Promise<ResultadoCrawl> {
  const inicial = normalizarParaVisita(normalizarUrl(website)) ?? normalizarUrl(website);
  const res: ResultadoCrawl = { inicial, urlFinal: null, paginas: [], bloqueadoPorRobots: false, certificadoFalhou: false };

  let primeira = await baixar(inicial, o);
  if (primeira.erro === "timeout") primeira = await baixar(inicial, { ...o, timeoutMs: o.timeoutMs * 2 });
  // Sem https ou com certificado quebrado (comum em site pequeno): tenta as duas formas.
  if (primeira.erro) {
    const alternativa = inicial.startsWith("https://") ? inicial.replace(/^https:/, "http:") : inicial.replace(/^http:/, "https:");
    const segunda = await baixar(alternativa, o);
    if (!segunda.erro) {
      if (inicial.startsWith("https://")) res.certificadoFalhou = true;
      primeira = segunda;
    }
  }
  if (primeira.erro) {
    res.erroInicial = primeira.erro;
    res.paginas.push({ ...primeira, profundidade: 0 });
    return res;
  }
  res.urlFinal = primeira.urlFinal;

  const origem = new URL(primeira.urlFinal).origin;
  const regras = await regrasRobots(origem, o);
  if (!permitido(regras, new URL(primeira.urlFinal).pathname || "/")) {
    // A página inicial já foi pedida para saber se o site existe; o conteúdo não é usado.
    res.bloqueadoPorRobots = true;
    res.paginas.push({ ...primeira, html: "", profundidade: 0 });
    return res;
  }

  const visitadas = new Set<string>([inicial, normalizarParaVisita(primeira.urlFinal) ?? primeira.urlFinal]);
  res.paginas.push({ ...primeira, profundidade: 0 });
  let fronteira = primeira.html ? linksInternos(primeira.html, primeira.urlFinal).map((u) => ({ url: u, prof: 1 })) : [];

  while (fronteira.length && res.paginas.length < o.maxPaginas) {
    const { url, prof } = fronteira.shift()!;
    if (prof > o.profundidade || visitadas.has(url)) continue;
    visitadas.add(url);
    if (!permitido(regras, new URL(url).pathname)) continue;
    const p = await baixar(url, o);
    visitadas.add(normalizarParaVisita(p.urlFinal) ?? p.urlFinal);
    res.paginas.push({ ...p, profundidade: prof });
    if (p.html && prof < o.profundidade) {
      const novos = linksInternos(p.html, p.urlFinal)
        .filter((u) => !visitadas.has(u) && !fronteira.some((f) => f.url === u))
        .map((u) => ({ url: u, prof: prof + 1 }));
      fronteira = [...fronteira, ...novos].sort((a, b) => a.prof - b.prof || Number(PRIORIDADE.test(b.url)) - Number(PRIORIDADE.test(a.url)));
    }
  }
  return res;
}
