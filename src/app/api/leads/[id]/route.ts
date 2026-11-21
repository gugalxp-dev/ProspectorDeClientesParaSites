import { z } from "zod";
import { atualizarLead, excluirDadosPessoais, obterLeadCompleto } from "@/core/crm/leads";
import { db } from "@/core/db";
import { jsonErro, lerJson, rota } from "@/lib/http";

type P = { id: string };

export const GET = rota<P>(async (_req, { params }) => {
  const l = await obterLeadCompleto(params.id);
  return l ? Response.json(l) : jsonErro(404, "Lead não encontrado.");
});

const esquema = z.object({
  notas: z.string().max(10_000).nullable().optional(),
  responsavelId: z.string().max(40).nullable().optional(),
});

export const PATCH = rota<P>(async (req, { params, usuario }) => {
  const d = await lerJson(req, esquema);
  if (d.responsavelId && !(await db.usuario.findUnique({ where: { id: d.responsavelId } }))) return jsonErro(400, "Responsável inválido.");
  return Response.json(await atualizarLead(params.id, d, usuario.id));
});

const esquemaExclusao = z.object({ motivo: z.string().trim().min(3).max(500) });

/** LGPD: exclusão definitiva dos dados do lead. Só admin. */
export const DELETE = rota<P>(
  async (req, { params, usuario }) => {
    const { motivo } = await lerJson(req, esquemaExclusao);
    await excluirDadosPessoais(params.id, usuario.id, motivo);
    return Response.json({ ok: true });
  },
  { papel: "admin" },
);
