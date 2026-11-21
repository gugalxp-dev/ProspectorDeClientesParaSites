// Ponto único de acesso à IA: escolhe o provedor, aplica limites de consumo, tenta de novo em erro
// temporário, registra tokens/custo/latência em RegistroCusto e alerta perto do limite.

import { log, mensagemErro } from "@/lib/log";
import { obterConfig, type ConfigDe } from "../config";
import { db } from "../db";
import { emitir } from "../eventos";
import { credencial } from "../segredos";
import { ProvedorAnthropic } from "./anthropic";
import { ProvedorMock } from "./mock";
import { ProvedorOpenAI } from "./openai";
import { ErroTemporarioIA, LimiteConsumoExcedido, type MensagemIA, type PedidoIA, type ProvedorIA } from "./tipos";

export interface Referencias {
  buscaId?: string | null;
  leadId?: string | null;
  conversaId?: string | null;
}

export interface ChamadaIA {
  operacao: "qualificacao" | "agente" | "teste" | "resumo";
  sistema: string;
  mensagens: MensagemIA[];
  json?: boolean;
  refs?: Referencias;
  /** Resposta do provedor simulado, montada a partir dos fatos (sem chave de IA). */
  respostaMock?: (p: PedidoIA) => string;
  temperatura?: number;
}

export interface ResultadoIA {
  texto: string;
  provedor: string;
  modelo: string;
  simulado: boolean;
}

/** Só para testes: força um provedor. */
let provedorForcado: ProvedorIA | null = null;
export function forcarProvedor(p: ProvedorIA | null): void {
  provedorForcado = p;
}

export type NomeProvedor = "anthropic" | "openai" | "mock";

export async function provedorAtivo(cfg?: ConfigDe<"ia">): Promise<{ nome: NomeProvedor; motivo?: string }> {
  const c = cfg ?? (await obterConfig("ia"));
  if (c.provedor === "mock") return { nome: "mock", motivo: "Escolhido no painel." };
  const [anthropic, openai] = await Promise.all([credencial("ANTHROPIC_API_KEY"), credencial("OPENAI_API_KEY")]);
  if (c.provedor === "anthropic") return anthropic ? { nome: "anthropic" } : { nome: "mock", motivo: "ANTHROPIC_API_KEY não configurada: usando IA simulada." };
  if (c.provedor === "openai") return openai ? { nome: "openai" } : { nome: "mock", motivo: "OPENAI_API_KEY não configurada: usando IA simulada." };
  if (anthropic) return { nome: "anthropic" };
  if (openai) return { nome: "openai" };
  return { nome: "mock", motivo: "ANTHROPIC_API_KEY não configurada: usando IA simulada." };
}

function modeloDo(nome: NomeProvedor, cfg: ConfigDe<"ia">): string {
  return nome === "openai" ? cfg.modeloOpenai : cfg.modelo;
}

async function instanciar(cfg: ConfigDe<"ia">, respostaMock?: (p: PedidoIA) => string): Promise<ProvedorIA> {
  if (provedorForcado) return provedorForcado;
  const ativo = await provedorAtivo(cfg);
  if (ativo.nome === "anthropic") return new ProvedorAnthropic((await credencial("ANTHROPIC_API_KEY"))!);
  if (ativo.nome === "openai") return new ProvedorOpenAI((await credencial("OPENAI_API_KEY"))!);
  return new ProvedorMock(respostaMock);
}

/** Embeddings: só a OpenAI oferece. Sem chave dela (ex.: usando só Claude), devolve null e a busca usa BM25. */
async function provedorEmbeddings(cfg: ConfigDe<"ia">): Promise<ProvedorIA | null> {
  if (provedorForcado) return provedorForcado.suportaEmbeddings === false ? null : provedorForcado;
  const chave = await credencial("OPENAI_API_KEY");
  if (chave && cfg.provedor !== "mock") return new ProvedorOpenAI(chave);
  return (await provedorAtivo(cfg)).nome === "mock" ? new ProvedorMock() : null;
}

export function custoEstimado(cfg: ConfigDe<"ia">, modelo: string, entrada: number, saida: number): number | null {
  const preco = cfg.precos[modelo] ?? Object.entries(cfg.precos).find(([m]) => modelo.startsWith(m))?.[1];
  if (!preco) return null;
  return (entrada * preco.entradaPorMilhao + saida * preco.saidaPorMilhao) / 1_000_000;
}

export async function gastoNoPeriodo(desde: Date, categoria?: string): Promise<number> {
  const r = await db.registroCusto.aggregate({
    _sum: { custoUsd: true },
    where: { criadoEm: { gte: desde }, ...(categoria ? { categoria } : {}) },
  });
  return r._sum.custoUsd ?? 0;
}

function inicioDoDia(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}
function inicioDoMes(): Date {
  const d = inicioDoDia();
  d.setDate(1);
  return d;
}

/** Bloqueia chamadas pagas acima dos limites configurados (o simulado é sempre permitido). */
export async function conferirLimites(cfg: ConfigDe<"ia">): Promise<void> {
  const [dia, mes] = await Promise.all([gastoNoPeriodo(inicioDoDia(), "ia"), gastoNoPeriodo(inicioDoMes(), "ia")]);
  if (cfg.limiteDiarioUsd > 0 && dia >= cfg.limiteDiarioUsd) {
    throw new LimiteConsumoExcedido(`Limite diário de IA atingido (US$ ${dia.toFixed(4)} de US$ ${cfg.limiteDiarioUsd}).`);
  }
  if (cfg.limiteMensalUsd > 0 && mes >= cfg.limiteMensalUsd) {
    throw new LimiteConsumoExcedido(`Limite mensal de IA atingido (US$ ${mes.toFixed(4)} de US$ ${cfg.limiteMensalUsd}).`);
  }
}

async function alertarSePerto(cfg: ConfigDe<"ia">): Promise<void> {
  const [dia, mes] = await Promise.all([gastoNoPeriodo(inicioDoDia(), "ia"), gastoNoPeriodo(inicioDoMes(), "ia")]);
  const alertas: Array<[string, number, number]> = [
    ["diário", dia, cfg.limiteDiarioUsd],
    ["mensal", mes, cfg.limiteMensalUsd],
  ];
  for (const [nome, gasto, limite] of alertas) {
    if (limite <= 0 || gasto < (limite * cfg.alertaPct) / 100) continue;
    const titulo = `Consumo de IA em ${Math.round((gasto / limite) * 100)}% do limite ${nome}`;
    const jaAvisado = await db.notificacao.findFirst({
      where: { tipo: "limite_consumo", titulo: { startsWith: `Consumo de IA` }, criadoEm: { gte: nome === "diário" ? inicioDoDia() : inicioDoMes() }, mensagem: { contains: nome } },
    });
    if (jaAvisado) continue;
    const n = await db.notificacao.create({
      data: { tipo: "limite_consumo", titulo, mensagem: `Gasto estimado ${nome}: US$ ${gasto.toFixed(4)} de US$ ${limite}. Ajuste em Admin > IA.` },
    });
    await emitir("notificacao.nova", { id: n.id });
  }
}

export async function chamarIA(c: ChamadaIA): Promise<ResultadoIA> {
  const cfg = await obterConfig("ia");
  const provedor = await instanciar(cfg, c.respostaMock);
  const simulado = provedor.nome === "mock";
  if (!simulado) await conferirLimites(cfg);

  const pedido: PedidoIA = {
    modelo: provedor.nome === "mock" ? cfg.modelo : modeloDo(provedor.nome as NomeProvedor, cfg),
    esforco: cfg.esforco,
    sistema: c.sistema,
    mensagens: c.mensagens,
    json: c.json,
    temperatura: c.temperatura ?? cfg.temperatura,
    maxTokens: cfg.maxTokensResposta,
    timeoutMs: cfg.timeoutMs,
  };

  let ultimoErro: unknown;
  for (let tentativa = 0; tentativa < 3; tentativa++) {
    const inicio = Date.now();
    try {
      const r = await provedor.gerar(pedido);
      await db.registroCusto.create({
        data: {
          categoria: "ia",
          provedor: provedor.nome,
          modelo: r.modelo,
          operacao: c.operacao,
          tokensEntrada: r.tokensEntrada,
          tokensSaida: r.tokensSaida,
          custoUsd: simulado ? 0 : custoEstimado(cfg, r.modelo, r.tokensEntrada, r.tokensSaida),
          estimado: true,
          latenciaMs: Date.now() - inicio,
          buscaId: c.refs?.buscaId ?? null,
          leadId: c.refs?.leadId ?? null,
          conversaId: c.refs?.conversaId ?? null,
        },
      });
      if (!simulado) await alertarSePerto(cfg);
      return { texto: r.texto, provedor: provedor.nome, modelo: r.modelo, simulado };
    } catch (e) {
      ultimoErro = e;
      await db.registroCusto.create({
        data: {
          categoria: "ia",
          provedor: provedor.nome,
          modelo: pedido.modelo,
          operacao: c.operacao,
          custoUsd: 0,
          sucesso: false,
          erro: mensagemErro(e),
          latenciaMs: Date.now() - inicio,
          leadId: c.refs?.leadId ?? null,
          buscaId: c.refs?.buscaId ?? null,
          conversaId: c.refs?.conversaId ?? null,
        },
      });
      if (!(e instanceof ErroTemporarioIA)) throw e;
      log.aviso("IA: erro temporário, tentando de novo", { tentativa, erro: mensagemErro(e) });
      await new Promise((ok) => setTimeout(ok, 1000 * 2 ** tentativa));
    }
  }
  throw ultimoErro;
}

export async function gerarEmbeddings(textos: string[]): Promise<{ vetores: number[][]; modelo: string } | null> {
  const cfg = await obterConfig("ia");
  if (!cfg.usarEmbeddings || !textos.length) return null;
  const provedor = await provedorEmbeddings(cfg);
  if (!provedor) return null;
  const simulado = provedor.nome === "mock";
  if (!simulado) await conferirLimites(cfg);
  const inicio = Date.now();
  const r = await provedor.embeddings(textos, cfg.modeloEmbedding, cfg.timeoutMs);
  await db.registroCusto.create({
    data: {
      categoria: "ia",
      provedor: provedor.nome,
      modelo: r.modelo,
      operacao: "embedding",
      tokensEntrada: r.tokens,
      tokensSaida: 0,
      custoUsd: simulado ? 0 : custoEstimado(cfg, r.modelo, r.tokens, 0),
      latenciaMs: Date.now() - inicio,
    },
  });
  return { vetores: r.vetores, modelo: `${provedor.nome}:${r.modelo}` };
}

/** Extrai o primeiro objeto JSON de um texto (o modelo às vezes embrulha em ```json). */
export function lerJsonIA(texto: string): unknown {
  const limpo = texto.trim().replace(/^```(?:json)?\s*/i, "").replace(/```$/, "");
  try {
    return JSON.parse(limpo);
  } catch {
    const m = limpo.match(/\{[\s\S]*\}/);
    if (!m) throw new Error("A IA não devolveu JSON.");
    return JSON.parse(m[0]);
  }
}
