// Provedor Anthropic (Claude) pelo SDK oficial. É o provedor padrão.
// A chave vem do servidor (env ou painel, cifrada) e nunca vai para o navegador.
// A Anthropic não oferece embeddings: a busca na base de conhecimento usa BM25 (ou embeddings da OpenAI, se houver chave).

import Anthropic from "@anthropic-ai/sdk";
import { mascararSegredos } from "@/lib/log";
import { ErroConfiguracaoIA, ErroTemporarioIA, type PedidoIA, type ProvedorIA, type RespostaEmbeddings, type RespostaIA } from "./tipos";

export class ProvedorAnthropic implements ProvedorIA {
  nome = "anthropic";
  suportaEmbeddings = false;
  private cliente: Anthropic;

  /** fetchTeste: só para testes (simula a API sem rede). */
  constructor(chave: string, fetchTeste?: typeof fetch) {
    // Sem retentativas no SDK: o serviço de IA já tenta de novo e registra cada tentativa.
    this.cliente = new Anthropic({ apiKey: chave, maxRetries: 0, ...(fetchTeste ? { fetch: fetchTeste } : {}) });
  }

  async gerar(p: PedidoIA): Promise<RespostaIA> {
    let r: Anthropic.Beta.BetaMessage;
    try {
      r = await this.cliente.beta.messages.create(
        {
          model: p.modelo,
          max_tokens: p.maxTokens,
          // Pensamento adaptativo (padrão dos modelos atuais); a profundidade é controlada pelo esforço.
          output_config: { effort: p.esforco ?? "medium" },
          system: p.json ? `${p.sistema}\n\nResponda somente com um objeto JSON válido, sem texto antes ou depois.` : p.sistema,
          messages: p.mensagens.map((m) => ({ role: m.papel, content: m.conteudo })),
          // Se o modelo recusar por política de segurança, a API refaz o pedido num modelo de reserva.
          betas: ["server-side-fallback-2026-07-01"],
          fallbacks: "default",
        },
        { timeout: p.timeoutMs },
      );
    } catch (e) {
      if (e instanceof Anthropic.RateLimitError || e instanceof Anthropic.InternalServerError || e instanceof Anthropic.APIConnectionError) {
        throw new ErroTemporarioIA(mascararSegredos(`Anthropic: ${e.message}`));
      }
      if (e instanceof Anthropic.APIError) throw new ErroConfiguracaoIA(mascararSegredos(`Anthropic HTTP ${e.status}: ${e.message}`));
      throw e;
    }
    if (r.stop_reason === "refusal") throw new ErroConfiguracaoIA("O modelo recusou o pedido (política de segurança).");
    const texto = r.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
    const u = r.usage;
    return {
      texto,
      modelo: r.model,
      tokensEntrada: (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0),
      tokensSaida: u.output_tokens ?? 0,
    };
  }

  async embeddings(): Promise<RespostaEmbeddings> {
    throw new ErroConfiguracaoIA("A Anthropic não oferece embeddings.");
  }
}
