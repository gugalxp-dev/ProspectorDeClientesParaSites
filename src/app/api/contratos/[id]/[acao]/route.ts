// Ações sobre um contrato: finalizar (congela e cria o link), enviar (WhatsApp) e cancelar.

import { cancelar, enviarPorWhatsApp, ErroContrato, finalizar, linkPublico } from "@/core/contratos";
import { db } from "@/core/db";
import { EnvioBloqueado } from "@/core/whatsapp/conversas";
import { jsonErro, rota } from "@/lib/http";

type P = { id: string; acao: string };

export const POST = rota<P>(async (req, { params, usuario }) => {
  const { id, acao } = params;
  if (!(await db.contrato.findUnique({ where: { id }, select: { id: true } }))) return jsonErro(404, "Contrato não encontrado.");
  const origem = new URL(req.url).origin;
  try {
    if (acao === "finalizar") {
      const c = await finalizar(id, usuario.id);
      return Response.json({ ok: true, link: linkPublico(c.tokenCifrado, origem) });
    }
    if (acao === "enviar") {
      await enviarPorWhatsApp(id, usuario.id, origem);
      return Response.json({ ok: true });
    }
    if (acao === "cancelar") {
      await cancelar(id, usuario.id);
      return Response.json({ ok: true });
    }
    return jsonErro(404, "Ação desconhecida.");
  } catch (e) {
    if (e instanceof ErroContrato || e instanceof EnvioBloqueado) return jsonErro(422, e.message);
    throw e;
  }
});
