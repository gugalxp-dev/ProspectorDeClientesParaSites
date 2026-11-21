import { cancelarBusca, resumoBusca } from "@/core/busca";
import { auditar } from "@/lib/auditoria";
import { jsonErro, rota } from "@/lib/http";

type P = { id: string };

export const GET = rota<P>(async (_req, { params }) => {
  const r = await resumoBusca(params.id);
  return r ? Response.json(r) : jsonErro(404, "Pesquisa não encontrada.");
});

/** Cancela: trabalhos pendentes são descartados; empresas já encontradas ficam. */
export const DELETE = rota<P>(async (_req, { params, usuario }) => {
  if (!(await resumoBusca(params.id))) return jsonErro(404, "Pesquisa não encontrada.");
  await cancelarBusca(params.id);
  await auditar(usuario.id, "pesquisa_cancelada", params.id);
  return Response.json({ ok: true });
});
