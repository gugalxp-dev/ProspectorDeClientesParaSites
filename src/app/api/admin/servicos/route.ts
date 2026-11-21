import { esquemaServico } from "@/lib/esquemas";
import { db } from "@/core/db";
import { auditar } from "@/lib/auditoria";
import { lerJson, rota } from "@/lib/http";

export const GET = rota(async () => Response.json(await db.servico.findMany({ orderBy: [{ ordem: "asc" }, { nome: "asc" }] })), { papel: "admin" });

export const POST = rota(
  async (req, { usuario }) => {
    const d = await lerJson(req, esquemaServico);
    const s = await db.servico.create({ data: d });
    await auditar(usuario.id, "servico_criado", s.id, d);
    return Response.json(s, { status: 201 });
  },
  { papel: "admin" },
);
