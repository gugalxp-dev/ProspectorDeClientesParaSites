import { z } from "zod";
import { db } from "@/core/db";
import { lerJson, rota } from "@/lib/http";

export const GET = rota(async () =>
  Response.json(await db.notificacao.findMany({ orderBy: { criadoEm: "desc" }, take: 50 })),
);

const esquema = z.object({ ids: z.array(z.string().max(40)).max(200).optional() });

/** Marca como lidas (todas, ou as informadas). */
export const POST = rota(async (req) => {
  const { ids } = await lerJson(req, esquema);
  await db.notificacao.updateMany({ where: { lidaEm: null, ...(ids ? { id: { in: ids } } : {}) }, data: { lidaEm: new Date() } });
  return Response.json({ ok: true });
});
