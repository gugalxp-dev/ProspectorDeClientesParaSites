// Exclusão definitiva de uma pesquisa. GET = quantas empresas sairiam junto (para a confirmação); POST = exclui.

import { excluirBusca, previaExclusao } from "@/core/busca";
import { db } from "@/core/db";
import { auditar } from "@/lib/auditoria";
import { jsonErro, rota } from "@/lib/http";

type P = { id: string };

export const GET = rota<P>(async (_req, { params }) => {
  if (!(await db.busca.findUnique({ where: { id: params.id }, select: { id: true } }))) return jsonErro(404, "Pesquisa não encontrada.");
  return Response.json(await previaExclusao(params.id));
});

export const POST = rota<P>(async (_req, { params, usuario }) => {
  const b = await db.busca.findUnique({ where: { id: params.id }, select: { nicho: true, cidade: true } });
  if (!b) return jsonErro(404, "Pesquisa não encontrada.");
  const r = await excluirBusca(params.id);
  await auditar(usuario.id, "pesquisa_excluida", params.id, { ...b, ...r });
  return Response.json(r);
});
