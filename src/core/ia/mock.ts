// Provedor simulado, usado enquanto não há chave de IA (e nos testes).
// Não "pensa": devolve a resposta que o chamador preparou a partir dos FATOS (respostaMock),
// para que todo o fluxo (fila, custos, CRM, agente, WhatsApp) possa ser testado de ponta a ponta.
// Tudo o que ele gera fica marcado como simulado na interface.

import { createHash } from "node:crypto";
import type { PedidoIA, ProvedorIA, RespostaEmbeddings, RespostaIA } from "./tipos";

const contarTokens = (s: string) => Math.ceil(s.length / 4);

export class ProvedorMock implements ProvedorIA {
  nome = "mock";
  constructor(private resposta: (p: PedidoIA) => string = () => "{}") {}

  async gerar(p: PedidoIA): Promise<RespostaIA> {
    const texto = this.resposta(p);
    return {
      texto,
      modelo: "mock",
      tokensEntrada: contarTokens(p.sistema + p.mensagens.map((m) => m.conteudo).join("")),
      tokensSaida: contarTokens(texto),
    };
  }

  /** Vetor determinístico por palavras (hashing trick): parecido o bastante para testar a busca. */
  async embeddings(textos: string[]): Promise<RespostaEmbeddings> {
    const vetores = textos.map((t) => {
      const v = new Array(64).fill(0);
      for (const palavra of t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").match(/[a-z0-9]{3,}/g) ?? []) {
        const h = createHash("md5").update(palavra).digest();
        v[h[0] % 64] += 1;
      }
      const norma = Math.hypot(...v) || 1;
      return v.map((x) => x / norma);
    });
    return { vetores, modelo: "mock", tokens: textos.reduce((s, t) => s + contarTokens(t), 0) };
  }
}
