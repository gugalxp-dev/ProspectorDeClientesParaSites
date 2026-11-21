import { db } from "@/core/db";
import { auditar } from "@/lib/auditoria";
import { lerJson, rota } from "@/lib/http";
import { esquemaConhecimento } from "@/lib/esquemas";

type P = { id: string };

export const PUT = rota<P>(
  async (req, { params, usuario }) => {
    const d = await lerJson(req, esquemaConhecimento);
    // Texto mudou: o embedding antigo não vale mais e é recalculado na próxima consulta.
    const c = await db.conhecimento.update({ where: { id: params.id }, data: { ...d, embedding: null, embeddingModelo: null }, omit: { embedding: true } });
    await auditar(usuario.id, "conhecimento_editado", c.id, { titulo: d.titulo });
    return Response.json(c);
  },
  { papel: "admin" },
);

export const DELETE = rota<P>(
  async (_req, { params, usuario }) => {
    await db.conhecimento.delete({ where: { id: params.id } });
    await auditar(usuario.id, "conhecimento_excluido", params.id);
    return Response.json({ ok: true });
  },
  { papel: "admin" },
);
