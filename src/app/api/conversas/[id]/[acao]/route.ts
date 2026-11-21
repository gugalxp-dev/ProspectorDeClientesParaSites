// Ações na conversa: mensagem manual, assumir (pausar agente), devolver ao agente, simular cliente (modo mock).

import { z } from "zod";
import { db } from "@/core/db";
import { modoWhatsApp } from "@/core/whatsapp/cliente";
import { EnvioBloqueado, enviarMensagem, pausarAgente, reativarAgente } from "@/core/whatsapp/conversas";
import { payloadSimulado, receberEventos } from "@/core/whatsapp/webhook";
import { jsonErro, lerJson, rota } from "@/lib/http";

type P = { id: string; acao: string };

const texto = z.object({ texto: z.string().trim().min(1).max(4000) });

export const POST = rota<P>(async (req, { params, usuario }) => {
  const conversa = await db.conversa.findUnique({ where: { id: params.id } });
  if (!conversa) return jsonErro(404, "Conversa não encontrada.");
  try {
    switch (params.acao) {
      case "mensagem": {
        const { texto: t } = await lerJson(req, texto);
        const m = await enviarMensagem({ conversaId: conversa.id, autor: "humano", texto: t, usuarioId: usuario.id });
        return Response.json(m);
      }
      case "assumir":
        await pausarAgente(conversa.id, usuario.id);
        return Response.json({ ok: true });
      case "reativar":
        await reativarAgente(conversa.id, usuario.id);
        return Response.json({ ok: true });
      case "simular": {
        // Só no modo simulado: o painel faz o papel do cliente e a mensagem segue o caminho do webhook real.
        if ((await modoWhatsApp()) !== "mock") return jsonErro(404, "Simulador disponível só no modo mock.");
        const { texto: t } = await lerJson(req, texto);
        await receberEventos(payloadSimulado({ de: conversa.telefoneE164.replace(/\D/g, ""), texto: t }));
        return Response.json({ ok: true });
      }
    }
    return jsonErro(404, "Ação desconhecida.");
  } catch (e) {
    if (e instanceof EnvioBloqueado) return jsonErro(422, e.message);
    throw e;
  }
});
