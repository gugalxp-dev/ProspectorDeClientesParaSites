// Rascunho do contrato de um lead: salva os dados essenciais e devolve a prévia do texto.

import { z } from "zod";
import { obterConfig } from "@/core/config";
import { esquemaDadosContrato, pendenciasContrato, renderizar, salvarRascunho } from "@/core/contratos";
import { db } from "@/core/db";
import { jsonErro, lerJson, rota } from "@/lib/http";

const esquema = z.object({ leadId: z.string().min(1).max(40), dados: esquemaDadosContrato });

export const POST = rota(async (req, { usuario }) => {
  const { leadId, dados } = await lerJson(req, esquema);
  if (!(await db.lead.findUnique({ where: { id: leadId }, select: { id: true } }))) return jsonErro(404, "Lead não encontrado.");
  const [c, cfg] = await Promise.all([salvarRascunho(leadId, dados, usuario.id), obterConfig("contrato")]);
  return Response.json({ id: c.id, numero: c.numero, previa: renderizar(cfg.modelo, c.numero, dados, cfg), pendencias: pendenciasContrato(dados, cfg) });
});
