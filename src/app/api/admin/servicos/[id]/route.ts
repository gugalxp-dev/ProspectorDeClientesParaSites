import { db } from "@/core/db";
import { auditar } from "@/lib/auditoria";
import { lerJson, rota } from "@/lib/http";
import { esquemaServico } from "@/lib/esquemas";

type P = { id: string };

export const PUT = rota<P>(
  async (req, { params, usuario }) => {
    const d = await lerJson(req, esquemaServico);
    const s = await db.servico.update({ where: { id: params.id }, data: d });
    await auditar(usuario.id, "servico_editado", s.id, d);
    return Response.json(s);
  },
  { papel: "admin" },
);

export const DELETE = rota<P>(
  async (_req, { params, usuario }) => {
    await db.servico.delete({ where: { id: params.id } });
    await auditar(usuario.id, "servico_excluido", params.id);
    return Response.json({ ok: true });
  },
  { papel: "admin" },
);
