import { esquemaConhecimento } from "@/lib/esquemas";
import { db } from "@/core/db";
import { auditar } from "@/lib/auditoria";
import { lerJson, rota } from "@/lib/http";

export const GET = rota(async () => Response.json(await db.conhecimento.findMany({ orderBy: [{ categoria: "asc" }, { titulo: "asc" }], omit: { embedding: true } })), { papel: "admin" });

export const POST = rota(
  async (req, { usuario }) => {
    const d = await lerJson(req, esquemaConhecimento);
    const c = await db.conhecimento.create({ data: d, omit: { embedding: true } });
    await auditar(usuario.id, "conhecimento_criado", c.id, { titulo: d.titulo });
    return Response.json(c, { status: 201 });
  },
  { papel: "admin" },
);
