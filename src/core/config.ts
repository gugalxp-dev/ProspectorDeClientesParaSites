// Configurações editáveis pelo painel administrativo, guardadas na tabela Config (JSON validado com Zod).
// Cada seção tem valores padrão; o painel grava só o que foi alterado.

import { z } from "zod";
import { db } from "./db";

const precoModelo = z.object({
  entradaPorMilhao: z.number().min(0),
  saidaPorMilhao: z.number().min(0),
});

export const esquemaIa = z.object({
  /** "auto": Claude (Anthropic) quando houver chave; senão OpenAI, se houver; senão simulado. */
  provedor: z.enum(["auto", "anthropic", "openai", "mock"]).default("auto"),
  /** Modelo Claude. Opus = melhor qualidade; Sonnet e Haiku = mais baratos. */
  modelo: z.string().min(1).max(100).default("claude-opus-5-5"),
  /** Profundidade do raciocínio do Claude: low = mais rápido e barato, high = mais cuidadoso. */
  esforco: z.enum(["low", "medium", "high"]).default("medium"),
  /** Só quando o provedor for a OpenAI. */
  modeloOpenai: z.string().min(1).max(100).default("gpt-4o-mini"),
  /** Embeddings só existem na OpenAI; sem chave dela, a busca na base usa BM25 (palavras-chave). */
  modeloEmbedding: z.string().max(100).default("text-embedding-3-small"),
  usarEmbeddings: z.boolean().default(true),
  /** Só para a OpenAI (o Claude atual não usa temperatura). */
  temperatura: z.number().min(0).max(2).default(0.4),
  /** Inclui o raciocínio do Claude, por isso o valor é alto. */
  maxTokensResposta: z.number().int().min(1000).max(32_000).default(8000),
  timeoutMs: z.number().int().min(5000).max(120_000).default(45_000),
  /** USD por 1 milhão de tokens. Usado só para ESTIMAR custo; confira em https://claude.com/pricing e https://openai.com/api/pricing */
  precos: z.record(z.string(), precoModelo).default({
    "claude-opus-5-5": { entradaPorMilhao: 4, saidaPorMilhao: 20 },
    "claude-sonnet-5-5": { entradaPorMilhao: 2, saidaPorMilhao: 10 },
    "claude-haiku-5-5": { entradaPorMilhao: 0.1, saidaPorMilhao: 0.5 },
    // Modelos de reserva que a API pode usar quando o principal recusa um pedido.
    "claude-opus-4-8": { entradaPorMilhao: 5, saidaPorMilhao: 25 },
    "claude-opus-5": { entradaPorMilhao: 5, saidaPorMilhao: 25 },
    "gpt-4o-mini": { entradaPorMilhao: 0.15, saidaPorMilhao: 0.6 },
    "text-embedding-3-small": { entradaPorMilhao: 0.02, saidaPorMilhao: 0 },
  }),
  limiteDiarioUsd: z.number().min(0).default(2),
  limiteMensalUsd: z.number().min(0).default(30),
  alertaPct: z.number().int().min(1).max(100).default(80),
});

export const esquemaAgente = z.object({
  ativo: z.boolean().default(true),
  nomeAgente: z.string().max(60).default(""),
  nomeEmpresa: z.string().max(120).default(""),
  /** Instruções de comportamento (o "jeito" do agente). Regras de segurança fixas ficam no código do agente. */
  instrucoes: z
    .string()
    .max(8000)
    .default(
      [
        "Você é um consultor comercial que oferece desenvolvimento de sites institucionais para pequenas e médias empresas.",
        "Converse de forma natural, cordial e objetiva, em português do Brasil, como uma pessoa real no WhatsApp: mensagens curtas, sem listas longas, sem emojis em excesso.",
        "Entenda o negócio do cliente antes de oferecer. Faça no máximo uma pergunta por mensagem.",
        "Adapte os argumentos ao segmento do cliente usando a base de conhecimento.",
        "Explique a diferença entre ter um site próprio e depender só de redes sociais quando fizer sentido.",
        "Trate objeções com respeito e argumentos fundamentados; se o cliente não tiver interesse, agradeça e encerre sem insistir.",
      ].join("\n"),
    ),
  maxSaidasSemResposta: z.number().int().min(1).max(5).default(2),
  maxMensagensPorConversaDia: z.number().int().min(1).max(50).default(12),
  mensagemTransferencia: z
    .string()
    .max(500)
    .default("Combinado! Vou passar seu atendimento para uma pessoa da nossa equipe, que continua com você por aqui em breve."),
  mensagemOptOut: z.string().max(500).default("Tudo bem, não enviaremos mais mensagens. Obrigado pela atenção!"),
  templatePrimeiroContato: z.string().max(512).default(""),
  idiomaTemplate: z.string().max(10).default("pt_BR"),
  /** Quantas mensagens do histórico vão no contexto. */
  historicoMaximo: z.number().int().min(4).max(60).default(20),
  trechosConhecimento: z.number().int().min(1).max(12).default(5),
});

export const esquemaTransferencia = z.object({
  aoAceitarProposta: z.boolean().default(true),
  aoPedirHumano: z.boolean().default(true),
  aoPedirDescontoAcimaDoLimite: z.boolean().default(true),
  aoNaoSaberResponder: z.boolean().default(true),
  maxObjecoes: z.number().int().min(1).max(20).default(5),
  palavrasOptOut: z
    .array(z.string().max(60))
    .default(["parar", "sair", "stop", "descadastrar", "não quero receber", "nao quero receber", "não me mande", "remover meu número"]),
});

export const esquemaProspeccao = z.object({
  fontes: z.record(z.string(), z.object({ ativa: z.boolean() })).default({
    osm: { ativa: true },
    gmaps: { ativa: false },
    places: { ativa: false },
  }),
  maxEmpresasPorBusca: z.number().int().min(10).max(2000).default(300),
  buscasSimultaneas: z.number().int().min(1).max(10).default(3),
  crawler: z
    .object({
      profundidade: z.number().int().min(0).max(4).default(2),
      maxPaginasPorSite: z.number().int().min(1).max(30).default(6),
      concorrencia: z.number().int().min(1).max(16).default(4),
      atrasoPorHostMs: z.number().int().min(250).max(30_000).default(1000),
      timeoutMs: z.number().int().min(2000).max(60_000).default(10_000),
      respeitarRobots: z.boolean().default(true),
    })
    .default({ profundidade: 2, maxPaginasPorSite: 6, concorrencia: 4, atrasoPorHostMs: 1000, timeoutMs: 10_000, respeitarRobots: true }),
  qualificarAutomaticamente: z.boolean().default(true),
  scoreMinimoQualificado: z.number().int().min(0).max(100).default(50),
  /** Score final = regras x (100 - pesoIaPct)% + IA x pesoIaPct%. */
  pesoIaPct: z.number().int().min(0).max(100).default(50),
  reverificarSiteAposDias: z.number().int().min(1).max(365).default(30),
  /** Procura o site oficial pelo nome quando a fonte não traz (domínios prováveis + confirmação na página). */
  inferirSite: z.boolean().default(true),
  /** Google Places: preço por requisição de Text Search (com telefone e site = SKU Enterprise). */
  custoPlacesPorRequisicaoUsd: z.number().min(0).max(1).default(0.035),
});

export const esquemaPesos = z.object({
  semSite: z.number().default(35),
  soRedeSocial: z.number().default(30),
  siteForaDoAr: z.number().default(30),
  siteComProblemas: z.number().default(20),
  comSite: z.number().default(0),
  celular: z.number().default(20),
  email: z.number().default(5),
  redeSocial: z.number().default(10),
});

export const esquemaWhatsapp = z.object({
  limiteDiarioTemplates: z.number().int().min(0).max(1000).default(30),
  limiteDiarioMensagens: z.number().int().min(0).max(10_000).default(300),
  /** USD por template enviado, se você quiser estimar. null = sem estimativa. Confira na tabela da Meta. */
  precoTemplateUsd: z.number().min(0).nullable().default(null),
});

export const esquemaLgpd = z.object({
  retencaoDiasLeadsSemContato: z.number().int().min(7).max(3650).default(180),
  retencaoDiasMensagens: z.number().int().min(30).max(3650).default(365),
  retencaoDiasLogs: z.number().int().min(7).max(3650).default(90),
});

export const SECOES = {
  ia: esquemaIa,
  agente: esquemaAgente,
  transferencia: esquemaTransferencia,
  prospeccao: esquemaProspeccao,
  pesos: esquemaPesos,
  whatsapp: esquemaWhatsapp,
  lgpd: esquemaLgpd,
} as const;

export type Secao = keyof typeof SECOES;
export type ConfigDe<S extends Secao> = z.infer<(typeof SECOES)[S]>;

export async function obterConfig<S extends Secao>(secao: S): Promise<ConfigDe<S>> {
  const c = await db.config.findUnique({ where: { chave: secao } });
  let bruto: unknown = {};
  if (c) {
    try {
      bruto = JSON.parse(c.valor);
    } catch {
      bruto = {};
    }
  }
  const r = SECOES[secao].safeParse(bruto);
  // Config antiga ou corrompida: volta ao padrão em vez de derrubar a aplicação.
  return (r.success ? r.data : SECOES[secao].parse({})) as ConfigDe<S>;
}

export async function salvarConfig<S extends Secao>(secao: S, valor: unknown): Promise<ConfigDe<S>> {
  const dados = SECOES[secao].parse(valor) as ConfigDe<S>;
  const v = JSON.stringify(dados);
  await db.config.upsert({ where: { chave: secao }, create: { chave: secao, valor: v }, update: { valor: v } });
  return dados;
}
