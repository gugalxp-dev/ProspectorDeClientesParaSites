// Provedor OpenAI via HTTP (sem SDK): Chat Completions e Embeddings.
// A chave vem do servidor (env ou painel, cifrada) e nunca vai para o navegador.

import { env } from "@/lib/env";
import { mascararSegredos } from "@/lib/log";
import { ErroConfiguracaoIA, ErroTemporarioIA, type PedidoIA, type ProvedorIA, type RespostaEmbeddings, type RespostaIA } from "./tipos";

export class ProvedorOpenAI implements ProvedorIA {
  nome = "openai";
  constructor(private chave: string) {}

  private async post(caminho: string, corpo: unknown, timeoutMs: number): Promise<unknown> {
    let r: Response;
    try {
      r = await fetch(`${env().OPENAI_BASE_URL}${caminho}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${this.chave}`, "Content-Type": "application/json" },
        body: JSON.stringify(corpo),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (e) {
      throw new ErroTemporarioIA(`OpenAI inacessível: ${(e as Error).name === "TimeoutError" ? "tempo esgotado" : (e as Error).message}`);
    }
    const texto = await r.text();
    if (!r.ok) {
      let msg = texto.slice(0, 300);
      try {
        msg = (JSON.parse(texto) as { error?: { message?: string } }).error?.message ?? msg;
      } catch {
        // corpo não é JSON
      }
      msg = mascararSegredos(`OpenAI HTTP ${r.status}: ${msg}`);
      if (r.status === 429 || r.status >= 500) throw new ErroTemporarioIA(msg);
      throw new ErroConfiguracaoIA(msg);
    }
    return JSON.parse(texto);
  }

  async gerar(p: PedidoIA): Promise<RespostaIA> {
    const dados = (await this.post(
      "/chat/completions",
      {
        model: p.modelo,
        messages: [{ role: "system", content: p.sistema }, ...p.mensagens.map((m) => ({ role: m.papel, content: m.conteudo }))],
        temperature: p.temperatura,
        max_tokens: p.maxTokens,
        ...(p.json ? { response_format: { type: "json_object" } } : {}),
      },
      p.timeoutMs,
    )) as { model: string; choices: Array<{ message: { content: string | null } }>; usage?: { prompt_tokens: number; completion_tokens: number } };
    return {
      texto: dados.choices[0]?.message?.content ?? "",
      modelo: dados.model ?? p.modelo,
      tokensEntrada: dados.usage?.prompt_tokens ?? 0,
      tokensSaida: dados.usage?.completion_tokens ?? 0,
    };
  }

  async embeddings(textos: string[], modelo: string, timeoutMs: number): Promise<RespostaEmbeddings> {
    const dados = (await this.post("/embeddings", { model: modelo, input: textos }, timeoutMs)) as {
      model: string;
      data: Array<{ embedding: number[]; index: number }>;
      usage?: { total_tokens: number };
    };
    return {
      vetores: dados.data.sort((a, b) => a.index - b.index).map((d) => d.embedding),
      modelo: dados.model ?? modelo,
      tokens: dados.usage?.total_tokens ?? 0,
    };
  }
}
