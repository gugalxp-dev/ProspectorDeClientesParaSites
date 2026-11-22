// Refaz uma pesquisa (mesmo segmento e cidade) com as regras atuais.

import { refazerBusca } from "@/core/busca";
import { db } from "@/core/db";
import { auditar } from "@/lib/auditoria";
import { jsonErro, rota } from "@/lib/http";

type P = { id: string };

export const POST = rota<P>(async (_req, { params, usuario }) => {
  if (!(await db.busca.findUnique({ where: { id: params.id }, select: { id: true } }))) return jsonErro(404, "Pesquisa não encontrada.");
  try {
    await refazerBusca(params.id);
  } catch (e) {
    return jsonErro(422, (e as Error).message);
  }
  await auditar(usuario.id, "pesquisa_refeita", params.id);
  return Response.json({ ok: true });
});
