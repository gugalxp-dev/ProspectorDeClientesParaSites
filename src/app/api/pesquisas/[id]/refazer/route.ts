// Refaz uma pesquisa do zero. GET = quantas empresas saem (para a confirmação); POST = refaz.

import { previaExclusao, refazerBusca } from "@/core/busca";
import { db } from "@/core/db";
import { auditar } from "@/lib/auditoria";
import { jsonErro, rota } from "@/lib/http";

type P = { id: string };

export const GET = rota<P>(async (_req, { params }) => {
  if (!(await db.busca.findUnique({ where: { id: params.id }, select: { id: true } }))) return jsonErro(404, "Pesquisa não encontrada.");
  return Response.json(await previaExclusao(params.id));
});

export const POST = rota<P>(async (_req, { params, usuario }) => {
  if (!(await db.busca.findUnique({ where: { id: params.id }, select: { id: true } }))) return jsonErro(404, "Pesquisa não encontrada.");
  try {
    const r = await refazerBusca(params.id);
    await auditar(usuario.id, "pesquisa_refeita", params.id, r);
    return Response.json(r);
  } catch (e) {
    return jsonErro(422, (e as Error).message);
  }
});
