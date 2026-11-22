// Fonte "Busca na internet (IA)": a IA da OpenAI pesquisa na web (Google Maps, sites, Instagram, guias locais)
// e devolve empresas do segmento na cidade. Usa a ferramenta oficial web_search da Responses API.
// Docs: https://platform.openai.com/docs/guides/tools-web-search
//
// Uma chamada por consulta (a IA tende a fazer só 1 busca por chamada), com consultas variadas; os resultados
// são juntados sem repetir empresa. IA pode errar ou inventar dados, por isso tudo o que vem daqui é CONFERIDO:
// o telefone é verificado no próprio WhatsApp (Baileys) e o site é visitado de verdade (crawler).
// Custo: ~US$ 0,012 por consulta. Limitado por pesquisa (Admin > Prospecção) e pelos limites de gasto de IA.

import { createHash } from "node:crypto";
import { z } from "zod";
import { env } from "@/lib/env";
import { log, mascararSegredos, mensagemErro } from "@/lib/log";
import { obterConfig } from "../config";
import { db } from "../db";
import { conferirLimites, custoEstimado, lerJsonIA } from "../ia/servico";
import { credencial } from "../segredos";
import type { LugarBruto } from "../tipos";
import { FonteIndisponivel, type FonteDescoberta, type ParametrosDescoberta } from "./tipos";

const empresa = z.object({
  nome: z.string().min(2).max(200),
  telefone: z.string().max(40).nullish(),
  whatsapp: z.string().max(40).nullish(),
  instagram: z.string().max(200).nullish(),
  site: z.string().max(300).nullish(),
  endereco: z.string().max(300).nullish(),
  fonte: z.string().max(500).nullish(),
});
const resposta = z.object({ empresas: z.array(z.unknown()).default([]) });

/** Consultas diferentes, uma por chamada. Quantas são usadas: Admin > Prospecção (padrão 4). */
export function consultas(nicho: string, cidade: string): string[] {
  return [
    `${nicho} em ${cidade}`,
    `${nicho} ${cidade} whatsapp contato`,
    `${nicho} ${cidade} instagram`,
    `empresas de ${nicho} em ${cidade} telefone endereço`,
    `melhores ${nicho} ${cidade} avaliações`,
    `${nicho} ${cidade} guia local empresas`,
    `serviços de ${nicho} perto de ${cidade}`,
    `${nicho} ${cidade} google maps`,
    `${nicho} ${cidade} facebook`,
    `${nicho} ${cidade} orçamento`,
  ];
}

function instrucoes(consulta: string, nicho: string, cidade: string, max: number, jaAchadas: string[]): string {
  const repetir = jaAchadas.length ? `- Já temos estas, NÃO repita: ${jaAchadas.slice(0, 60).join("; ")}.\n` : "";
  return [
    `Você é um pesquisador comercial. Faça a busca na web por: "${consulta}".`,
    `Liste as EMPRESAS LOCAIS REAIS do segmento "${nicho}" em ${cidade}, Brasil, que aparecerem, com o contato de cada uma.`,
    "Regras:",
    "- Só empresas que apareceram nos resultados. NUNCA invente nome, telefone, site ou Instagram.",
    "- Prefira negócios locais e independentes. Ignore redes e franquias nacionais (ex.: McDonald's, Subway, O Boticário).",
    "- Telefone COMPLETO, com DDD, exatamente como apareceu. Prefira celular/WhatsApp. Número cortado (com \"...\") não serve: use null.",
    "- instagram: URL ou @usuario do perfil da empresa, se apareceu. site: só o site próprio (não Instagram/Facebook/iFood).",
    "- Campo sem informação: null de verdade (não a palavra \"null\").",
    "- fonte: a URL onde você viu os dados.",
    `${repetir}- Até ${max} empresas.`,
    "Responda SOMENTE um objeto JSON, sem texto antes ou depois:",
    '{"empresas":[{"nome":string,"telefone":string|null,"whatsapp":string|null,"instagram":string|null,"site":string|null,"endereco":string|null,"fonte":string|null}]}',
  ].join("\n");
}

interface RespostaOpenAI {
  model?: string;
  output?: Array<{ type: string; content?: Array<{ type: string; text?: string }> }>;
  usage?: { input_tokens?: number; output_tokens?: number };
  error?: { message?: string };
}

const VAZIO = /^(null|none|undefined|n\/?a|-+|n[aã]o (informado|encontrado|dispon[ií]vel)|sem( telefone| site| instagram)?)$/i;

/** A IA às vezes escreve "null", "-" ou "não informado" em vez de deixar vazio. */
export function valor(v: string | null | undefined): string | undefined {
  const t = v?.trim();
  return !t || VAZIO.test(t) ? undefined : t;
}

function urlInstagram(v: string | undefined): string | undefined {
  if (!v) return undefined;
  if (/instagram\.com\//i.test(v)) return v.startsWith("http") ? v : `https://${v}`;
  const u = v.replace(/^@/, "").replace(/[^\w.]/g, "");
  return u ? `https://instagram.com/${u}` : undefined;
}

const chaveNome = (nome: string) =>
  nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
/** Id estável (nome + cidade), para a mesma empresa achada de novo não virar outro lead. */
const idEstavel = (nome: string, cidade: string) => createHash("sha1").update(`${chaveNome(nome)}|${cidade.toLowerCase().trim()}`).digest("hex").slice(0, 20);

/** Uma chamada à OpenAI com busca na web. Registra o custo (buscas + tokens) em Gastos. */
async function chamar(chave: string, input: string, cidade: string, buscaId: string | undefined): Promise<unknown[]> {
  const [cfgIa, cfg] = await Promise.all([obterConfig("ia"), obterConfig("prospeccao")]);
  await conferirLimites(cfgIa); // respeita os limites diário/mensal de IA a cada chamada
  const inicio = Date.now();
  let r: Response;
  try {
    r = await fetch(`${env().OPENAI_BASE_URL}/responses`, {
      method: "POST",
      headers: { Authorization: `Bearer ${chave}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: cfgIa.modeloOpenai,
        tools: [{ type: "web_search", user_location: { type: "approximate", country: "BR", city: cidade } }],
        max_tool_calls: 2, // a busca pedida + no máximo uma para completar um contato
        input,
      }),
      signal: AbortSignal.timeout(180_000),
    });
  } catch (e) {
    throw new FonteIndisponivel(`OpenAI inacessível: ${mensagemErro(e)}`);
  }
  const dados = (await r.json().catch(() => ({}))) as RespostaOpenAI;
  const buscas = (dados.output ?? []).filter((o) => o.type === "web_search_call").length;
  const tokensEntrada = dados.usage?.input_tokens ?? 0;
  const tokensSaida = dados.usage?.output_tokens ?? 0;
  const modelo = dados.model ?? cfgIa.modeloOpenai;
  await db.registroCusto.create({
    data: {
      categoria: "ia",
      provedor: "openai",
      modelo,
      operacao: "descoberta_web",
      tokensEntrada,
      tokensSaida,
      custoUsd: r.ok ? buscas * cfg.web.custoPorBuscaUsd + (custoEstimado(cfgIa, modelo, tokensEntrada, tokensSaida) ?? 0) : 0,
      estimado: true,
      sucesso: r.ok,
      erro: r.ok ? null : mascararSegredos(dados.error?.message ?? `HTTP ${r.status}`).slice(0, 500),
      latenciaMs: Date.now() - inicio,
      buscaId: buscaId ?? null,
    },
  });
  if (!r.ok) {
    const msg = mascararSegredos(`Busca na internet (OpenAI HTTP ${r.status}): ${dados.error?.message ?? "sem detalhe"}`);
    if (r.status === 429 || r.status >= 500) throw new FonteIndisponivel(msg);
    throw new Error(msg);
  }
  const texto = (dados.output ?? [])
    .filter((o) => o.type === "message")
    .flatMap((o) => o.content ?? [])
    .filter((c) => c.type === "output_text")
    .map((c) => c.text ?? "")
    .join("\n");
  try {
    return resposta.parse(lerJsonIA(texto)).empresas;
  } catch {
    log.aviso("busca na internet: resposta da IA não veio em JSON", { trecho: texto.slice(0, 200) });
    return [];
  }
}

function paraLugar(d: z.infer<typeof empresa>, cidade: string): LugarBruto {
  const site = valor(d.site);
  const fonte = valor(d.fonte);
  return {
    fonte: "web",
    idExterno: idEstavel(d.nome, cidade),
    nome: d.nome.trim(),
    cidade,
    endereco: valor(d.endereco),
    // WhatsApp primeiro: é o canal de contato. O número é conferido no WhatsApp antes de valer.
    telefone: [valor(d.whatsapp), valor(d.telefone)].find((t) => t && !t.includes("...") && !t.includes("…")),
    website: site ? (/^https?:\/\//i.test(site) ? site : `https://${site}`) : undefined,
    instagram: urlInstagram(valor(d.instagram)),
    url: fonte && /^https?:\/\//i.test(fonte) ? fonte : undefined,
  };
}

async function buscarNaWeb(p: ParametrosDescoberta): Promise<LugarBruto[]> {
  const chave = await credencial("OPENAI_API_KEY");
  if (!chave) throw new FonteIndisponivel("Busca na internet: cadastre a chave da OpenAI em Admin > Integrações.");
  const cfg = await obterConfig("prospeccao");
  const max = Math.min(cfg.web.maxEmpresas, p.max);
  const achadas = new Map<string, LugarBruto>();

  for (const consulta of consultas(p.nicho, p.cidade).slice(0, cfg.web.maxBuscas)) {
    if (achadas.size >= max) break;
    let lista: unknown[];
    try {
      const jaTem = [...achadas.values()].map((l) => l.nome);
      lista = await chamar(chave, instrucoes(consulta, p.nicho, p.cidade, max - achadas.size, jaTem), p.cidade, p.buscaId);
    } catch (e) {
      if (achadas.size) break; // já temos resultado: devolve o que achou em vez de perder tudo
      throw e;
    }
    for (const bruto of lista) {
      const e = empresa.safeParse(bruto);
      if (!e.success) continue;
      const novo = paraLugar(e.data, p.cidade);
      // Mesma empresa em duas buscas: junta os dados (o que faltava numa, a outra completa).
      const atual = achadas.get(novo.idExterno);
      const definidos = atual ? Object.fromEntries(Object.entries(atual).filter(([, v]) => v !== undefined)) : {};
      achadas.set(novo.idExterno, { ...novo, ...definidos } as LugarBruto);
      if (achadas.size >= max) break;
    }
  }
  log.info("busca na internet concluída", { nicho: p.nicho, cidade: p.cidade, empresas: achadas.size });
  return [...achadas.values()];
}

export const fonteWeb: FonteDescoberta = {
  id: "web",
  nome: "Busca na internet (IA)",
  descricao: "A IA pesquisa na web (Google Maps, sites, Instagram, guias) e traz empresas que não estão no OpenStreetMap. Telefones conferidos no WhatsApp.",
  aviso: "Paga: ~US$ 0,012 por busca; com 4 buscas, ~US$ 0,05 por pesquisa. Entra nos limites de gasto de IA (Admin > IA).",
  gratuita: false,
  async disponivel() {
    const [chave, cfg] = await Promise.all([credencial("OPENAI_API_KEY"), obterConfig("ia")]);
    if (!chave) return { ok: false, motivo: "Cadastre a chave da OpenAI em Admin > Integrações." };
    if (cfg.provedor === "mock") return { ok: false, motivo: "IA em modo simulado (Admin > IA)." };
    return { ok: true };
  },
  descobrir: buscarNaWeb,
};
