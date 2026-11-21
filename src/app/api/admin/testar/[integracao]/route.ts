// Testes de integração disparados pelo painel. Não considera a integração "validada" se estiver em modo simulado.

import { chamarIA, provedorAtivo } from "@/core/ia/servico";
import { clienteWhatsApp, modoWhatsApp } from "@/core/whatsapp/cliente";
import { jsonErro, rota } from "@/lib/http";
import { mensagemErro } from "@/lib/log";

type P = { integracao: string };

export const POST = rota<P>(
  async (_req, { params }) => {
    if (params.integracao === "ia") {
      const ativo = await provedorAtivo();
      try {
        const r = await chamarIA({
          operacao: "teste",
          sistema: "Responda apenas a palavra OK.",
          mensagens: [{ papel: "user", conteudo: "Teste de conexão." }],
          respostaMock: () => "OK (simulado)",
        });
        return Response.json({ ok: true, simulado: r.simulado, detalhe: `${r.provedor} / ${r.modelo}: ${r.texto.slice(0, 80)}`, aviso: ativo.motivo ?? null });
      } catch (e) {
        return Response.json({ ok: false, simulado: false, detalhe: mensagemErro(e) });
      }
    }
    if (params.integracao === "whatsapp") {
      const modo = await modoWhatsApp();
      try {
        const e = await (await clienteWhatsApp()).estado();
        return Response.json({ ...e, simulado: modo === "mock" });
      } catch (e) {
        return Response.json({ ok: false, simulado: modo === "mock", detalhe: mensagemErro(e) });
      }
    }
    return jsonErro(404, "Integração desconhecida.");
  },
  { papel: "admin" },
);
