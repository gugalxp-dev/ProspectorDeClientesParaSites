import { describe, expect, it } from "vitest";
import { ProvedorAnthropic } from "../src/core/ia/anthropic";
import { ErroConfiguracaoIA, ErroTemporarioIA, type PedidoIA } from "../src/core/ia/tipos";

const pedido: PedidoIA = {
  modelo: "claude-opus-5-5",
  sistema: "Você qualifica leads.",
  mensagens: [{ papel: "user", conteudo: "Analise a empresa X" }],
  json: true,
  temperatura: 0.4,
  esforco: "low",
  maxTokens: 8000,
  timeoutMs: 10_000,
};

function apiFalsa(status: number, corpo: unknown, capturar?: (url: string, init: RequestInit) => void): typeof fetch {
  return (async (url: string | URL | Request, init?: RequestInit) => {
    capturar?.(String(url), init ?? {});
    return new Response(JSON.stringify(corpo), { status, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
}

const respostaOk = {
  id: "msg_1",
  type: "message",
  role: "assistant",
  model: "claude-opus-5-5",
  content: [{ type: "thinking", thinking: "", signature: "x" }, { type: "text", text: '{"score": 80}' }],
  stop_reason: "end_turn",
  usage: { input_tokens: 100, output_tokens: 50, cache_read_input_tokens: 20, cache_creation_input_tokens: 0 },
};

describe("provedor Anthropic (Claude)", () => {
  it("monta o pedido certo e lê texto e tokens", async () => {
    let corpo: Record<string, unknown> = {};
    let cabecalhos = new Headers();
    const p = new ProvedorAnthropic("sk-ant-teste", apiFalsa(200, respostaOk, (_u, init) => {
      corpo = JSON.parse(String(init.body));
      cabecalhos = new Headers(init.headers);
    }));
    const r = await p.gerar(pedido);
    expect(r).toEqual({ texto: '{"score": 80}', modelo: "claude-opus-5-5", tokensEntrada: 120, tokensSaida: 50 });
    expect(corpo.model).toBe("claude-opus-5-5");
    expect(corpo.output_config).toEqual({ effort: "low" });
    expect(corpo.fallbacks).toBe("default");
    expect(corpo).not.toHaveProperty("temperature");
    expect(String(corpo.system)).toContain("objeto JSON");
    expect(cabecalhos.get("anthropic-beta")).toContain("server-side-fallback-2026-07-01");
  });

  it("limite de taxa e servidor fora viram erro temporário; chave inválida não", async () => {
    const erro = { type: "error", error: { type: "rate_limit_error", message: "devagar" } };
    await expect(new ProvedorAnthropic("k", apiFalsa(429, erro)).gerar(pedido)).rejects.toBeInstanceOf(ErroTemporarioIA);
    await expect(new ProvedorAnthropic("k", apiFalsa(529, erro)).gerar(pedido)).rejects.toBeInstanceOf(ErroTemporarioIA);
    await expect(new ProvedorAnthropic("k", apiFalsa(401, { type: "error", error: { type: "authentication_error", message: "chave" } })).gerar(pedido)).rejects.toBeInstanceOf(ErroConfiguracaoIA);
  });

  it("recusa do modelo vira erro definitivo e não gera embeddings", async () => {
    const p = new ProvedorAnthropic("k", apiFalsa(200, { ...respostaOk, content: [], stop_reason: "refusal" }));
    await expect(p.gerar(pedido)).rejects.toBeInstanceOf(ErroConfiguracaoIA);
    expect(p.suportaEmbeddings).toBe(false);
  });
});
