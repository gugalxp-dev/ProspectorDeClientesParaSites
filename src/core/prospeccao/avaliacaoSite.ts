// Avaliação técnica do site a partir do que o crawler viu. Só verificações objetivas: cada item
// é um FATO observado (com detalhe), nunca uma opinião. A IA usa isso como base e marca o que é hipótese.

import { dominioRegistravel, hostDe } from "../presenca";
import type { ResultadoCrawl } from "./crawler";
import type { DadosSite } from "./scraper";

export interface Verificacao {
  id: string;
  rotulo: string;
  /** true = ok, false = problema, null = não foi possível verificar */
  ok: boolean | null;
  detalhe?: string;
  peso: "alto" | "medio" | "baixo";
}

export interface AvaliacaoSite {
  online: boolean;
  https: boolean;
  urlFinal: string | null;
  motivoFora?: string;
  tempoMs: number | null;
  paginasVisitadas: number;
  paginasComErro: number;
  bloqueadoPorRobots: boolean;
  verificacoes: Verificacao[];
  /** Problemas observados (verificações com ok=false), em frases. */
  problemas: string[];
  avaliadoEm: string;
}

function motivoErro(erro: string): string {
  if (erro === "NXDOMAIN" || erro === "ENOTFOUND") return "O domínio não existe (confirmado no registro de domínios)";
  if (erro === "timeout") return "O site não respondeu dentro do tempo limite";
  if (erro === "ECONNREFUSED") return "O servidor do site recusou a conexão";
  if (/CERT|SSL|TLS/i.test(erro)) return "Erro de certificado de segurança";
  return `O site não abriu (${erro})`;
}

const ANO_ATUAL = new Date().getFullYear();

/** "www.subway.com.br" -> "subway". */
const marca = (host: string) => dominioRegistravel(host).split(".")[0];

const ESTACIONAMENTO = ["sedoparking.com", "sedo.com", "hugedomains.com", "dan.com", "afternic.com", "parkingcrew.net", "bodis.com", "godaddy.com", "registro.br", "above.com", "undeveloped.com"];
const DESAFIO_ROBO = /cf_chl_opt|cf-chl-widget|<title>\s*(?:Just a moment|Attention Required|Access Denied|Acesso negado)|Request unsuccessful\. Incapsula/i;

export function avaliarSite(c: ResultadoCrawl, dados: DadosSite): AvaliacaoSite {
  const base = {
    urlFinal: c.urlFinal,
    paginasVisitadas: c.paginas.length,
    paginasComErro: c.paginas.filter((p) => p.erro || (p.status ?? 0) >= 400).length,
    bloqueadoPorRobots: c.bloqueadoPorRobots,
    avaliadoEm: new Date().toISOString(),
  };
  const home = c.paginas[0];
  const fora = (motivo: string): AvaliacaoSite => ({
    ...base,
    online: false,
    https: false,
    motivoFora: motivo,
    tempoMs: home?.ms ?? null,
    verificacoes: [{ id: "acessivel", rotulo: "Site acessível", ok: false, detalhe: motivo, peso: "alto" }],
    problemas: [motivo],
  });

  if (!home || c.erroInicial) return fora(motivoErro(c.erroInicial ?? "sem resposta"));
  const st = home.status ?? 0;
  const hostFinal = c.urlFinal ? hostDe(c.urlFinal) : "";
  const outroDominio = !!c.urlFinal && dominioRegistravel(hostFinal) !== dominioRegistravel(hostDe(c.inicial));
  // Domínio expirado costuma cair numa página de estacionamento/venda.
  if (outroDominio && ESTACIONAMENTO.some((d) => hostFinal === d || hostFinal.endsWith(`.${d}`))) {
    return fora(`O domínio está estacionado ou à venda (${hostFinal})`);
  }
  // subway.com -> subway.com.br é a mesma marca (site regional): está no ar. Para outra marca, o domínio foi abandonado.
  if (outroDominio && marca(hostFinal) !== marca(hostDe(c.inicial))) {
    return fora(`O domínio redireciona para outro site (${hostFinal})`);
  }
  // Sites grandes bloqueiam robôs (Cloudflare, 403, 429). O site está no ar; só não dá para analisar o conteúdo.
  const bloqueouRobo = [401, 403, 429].includes(st) || (st >= 500 && DESAFIO_ROBO.test(home.html ?? "")) || DESAFIO_ROBO.test((home.html ?? "").slice(0, 5000));
  if (bloqueouRobo) {
    return {
      ...base,
      paginasComErro: 0,
      online: true,
      https: (c.urlFinal ?? c.inicial).startsWith("https://"),
      tempoMs: home.ms,
      verificacoes: [
        { id: "acessivel", rotulo: "Site acessível", ok: true, detalhe: `HTTP ${st}: o site bloqueia análise automática (comum em sites profissionais)`, peso: "alto" },
        { id: "conteudo", rotulo: "Conteúdo analisado", ok: null, detalhe: "Bloqueado para robôs", peso: "baixo" },
      ],
      problemas: [],
    };
  }
  if (st >= 500) return fora(`O site está com erro no servidor (HTTP ${st})`);
  if (st === 404 || st === 410) return fora(`A página inicial não existe (HTTP ${st})`);

  const html = home.html;
  const todas = c.paginas.map((p) => p.html).join("\n");
  const https = (c.urlFinal ?? "").startsWith("https://");
  const semConteudo = c.bloqueadoPorRobots || !html;
  const v: Verificacao[] = [];
  const add = (id: string, rotulo: string, ok: boolean | null, peso: Verificacao["peso"], detalhe?: string) => v.push({ id, rotulo, ok, peso, detalhe });

  add("acessivel", "Site acessível", true, "alto", `HTTP ${st} em ${home.ms} ms${outroDominio ? ` (redireciona para ${hostFinal})` : ""}`);
  add("https", "Usa HTTPS", https, "alto", https ? undefined : c.certificadoFalhou ? "O certificado HTTPS falhou; só abre por http" : "Abre sem HTTPS (navegadores mostram \"não seguro\")");
  add("rapido", "Responde rápido", home.ms <= 3000, "medio", `${home.ms} ms para a página inicial`);

  if (semConteudo) {
    add("conteudo", "Conteúdo analisado", null, "baixo", c.bloqueadoPorRobots ? "robots.txt não permite análise automática" : "Página inicial sem HTML");
  } else {
    const viewport = /<meta[^>]+name\s*=\s*["']viewport["']/i.test(html);
    add("mobile", "Adaptado para celular (meta viewport)", viewport, "alto", viewport ? undefined : "Sem a tag viewport: tende a aparecer pequeno/desalinhado no celular");
    const titulo = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim();
    add("titulo", "Tem título da página", !!titulo, "medio", titulo ? `"${titulo.slice(0, 80)}"` : "Página sem <title>");
    const descricao = /<meta[^>]+name\s*=\s*["']description["'][^>]+content\s*=\s*["'][^"']{10,}/i.test(html);
    add("descricao", "Tem descrição para buscadores", descricao, "baixo");
    add("h1", "Tem título principal (H1)", /<h1[\s>]/i.test(html), "baixo");

    const contato = dados.telefones.length + dados.whatsapps.length + dados.emails.length > 0 || /<form[\s>]/i.test(todas);
    add("contato", "Forma de contato clara", contato, "alto", contato ? undefined : "Nenhum telefone, WhatsApp, e-mail ou formulário encontrado nas páginas visitadas");
    add("whatsapp", "Botão/link de WhatsApp", dados.whatsapps.length > 0, "medio");
    add("formulario", "Formulário de contato", /<form[\s>]/i.test(todas), "baixo");

    const misto = https && /\s(?:src)\s*=\s*["']http:\/\//i.test(html);
    add("conteudo_misto", "Sem conteúdo inseguro misturado", !misto, "baixo", misto ? "Página HTTPS carrega recursos por http" : undefined);

    const anos = [...todas.matchAll(/(?:©|&copy;|copyright)\s*(?:\d{4}\s*[-–]\s*)?(\d{4})/gi)].map((m) => Number(m[1])).filter((a) => a > 1995 && a <= ANO_ATUAL);
    if (anos.length) {
      const ano = Math.max(...anos);
      add("atualizado", "Sinais de atualização recente", ano >= ANO_ATUAL - 2, "medio", `Ano no rodapé: ${ano}`);
    }
    const obsoleto = /<frameset|<marquee|\.swf["']|<blink/i.test(todas);
    add("tecnologia", "Sem tecnologias obsoletas", !obsoleto, "medio", obsoleto ? "Usa frames, marquee ou Flash" : undefined);
    const enderecoOuMapa = !!dados.endereco || /maps\.google|google\.com\/maps|<iframe[^>]+maps/i.test(todas);
    add("endereco", "Endereço ou mapa", enderecoOuMapa, "baixo");
  }
  if (base.paginasComErro > 0) {
    add("links", "Páginas internas funcionando", false, "medio", `${base.paginasComErro} de ${base.paginasVisitadas} páginas visitadas com erro`);
  }

  return {
    ...base,
    online: true,
    https,
    tempoMs: home.ms,
    verificacoes: v,
    problemas: v.filter((x) => x.ok === false).map((x) => (x.detalhe ? `${x.rotulo}: não — ${x.detalhe}` : `${x.rotulo}: não`)),
  };
}

/** Site no ar mas com problemas relevantes (2+ de peso alto/médio). */
export function siteComProblemas(a: AvaliacaoSite | null): boolean {
  if (!a || !a.online) return false;
  return a.verificacoes.filter((v) => v.ok === false && v.peso !== "baixo").length >= 2;
}
