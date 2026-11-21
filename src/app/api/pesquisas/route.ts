import { z } from "zod";
import { criarBusca, listarBuscas } from "@/core/busca";
import { auditar } from "@/lib/auditoria";
import { dentroDoLimite } from "@/lib/limite";
import { comIdempotencia, jsonErro, lerJson, rota } from "@/lib/http";

const esquema = z.object({
  nicho: z.string().trim().min(2).max(80),
  cidade: z.string().trim().min(2).max(80),
  fontes: z.array(z.string().max(30)).max(10).optional(),
});

export const GET = rota(async () => Response.json(await listarBuscas()));

export const POST = rota(async (req, { usuario }) =>
  comIdempotencia(req, `pesquisa:${usuario.id}`, async () => {
    const dados = await lerJson(req, esquema);
    if (!(await dentroDoLimite(`pesquisa:${usuario.id}`, 30, 3600_000))) return jsonErro(429, "Muitas pesquisas na última hora.");
    try {
      const b = await criarBusca(dados, usuario.id);
      await auditar(usuario.id, "pesquisa_criada", b.id, dados);
      return Response.json(b, { status: 201 });
    } catch (e) {
      return jsonErro(400, (e as Error).message);
    }
  }),
);
