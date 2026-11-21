// Contrato de um provedor de IA. Anthropic (Claude, padrão) e OpenAI; outro provedor = nova classe com esta interface
// registrada em ia/servico.ts. O resto da aplicação só conhece chamarIA() e gerarEmbeddings().

export interface MensagemIA {
  papel: "user" | "assistant";
  conteudo: string;
}

export interface PedidoIA {
  modelo: string;
  sistema: string;
  mensagens: MensagemIA[];
  /** Pede resposta em JSON (o texto devolvido deve ser um objeto JSON). */
  json?: boolean;
  /** Usada pela OpenAI. Os modelos Claude atuais não aceitam temperatura (usam pensamento adaptativo). */
  temperatura: number;
  /** Profundidade do raciocínio nos modelos Claude. */
  esforco?: "low" | "medium" | "high";
  maxTokens: number;
  timeoutMs: number;
}

export interface RespostaIA {
  texto: string;
  modelo: string;
  tokensEntrada: number;
  tokensSaida: number;
}

export interface RespostaEmbeddings {
  vetores: number[][];
  modelo: string;
  tokens: number;
}

export interface ProvedorIA {
  nome: string;
  /** false: o provedor não gera embeddings (ex.: Anthropic). */
  suportaEmbeddings?: boolean;
  gerar(p: PedidoIA): Promise<RespostaIA>;
  embeddings(textos: string[], modelo: string, timeoutMs: number): Promise<RespostaEmbeddings>;
}

/** Erro temporário (limite de taxa, servidor fora): vale tentar de novo. */
export class ErroTemporarioIA extends Error {}
/** Chave inválida, modelo inexistente, pedido inválido: tentar de novo não resolve. */
export class ErroConfiguracaoIA extends Error {}
export class LimiteConsumoExcedido extends Error {}
