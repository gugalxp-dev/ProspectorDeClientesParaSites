// Ações sobre um lead: mover no Kanban, consentimento, opt-out, iniciar contato, reprocessar.

import { z } from "zod";
import { ConflitoEdicao, moverLead } from "@/core/crm/leads";
import { db } from "@/core/db";
import { enfileirar } from "@/core/fila";
import { EnvioBloqueado, iniciarContato, registrarConsentimento, registrarOptOut } from "@/core/whatsapp/conversas";
import { auditar } from "@/lib/auditoria";
import { jsonErro, lerJson, rota } from "@/lib/http";
import { dentroDoLimite } from "@/lib/limite";

type P = { id: string; acao: string };

const esquemas = {
  mover: z.object({ etapaId: z.string().min(1).max(40), revisao: z.number().int().min(0) }),
  consentimento: z.object({
    origem: z.string().trim().min(5).max(500),
    baseLegal: z.enum(["consentimento", "legitimo_interesse", "execucao_contrato"]),
    evidencia: z.string().trim().max(500).optional().nullable(),
    telefone: z.string().trim().max(30).optional().nullable(),
  }),
  optout: z.object({ motivo: z.string().trim().min(3).max(300) }),
  contato: z.object({}),
  reprocessar: z.object({}),
};

export const POST = rota<P>(async (req, { params, usuario }) => {
  const { id, acao } = params;
  if (!(acao in esquemas)) return jsonErro(404, "Ação desconhecida.");
  if (!(await db.lead.findUnique({ where: { id }, select: { id: true } }))) return jsonErro(404, "Lead não encontrado.");

  try {
    switch (acao) {
      case "mover": {
        const d = await lerJson(req, esquemas.mover);
        return Response.json(await moverLead(id, d.etapaId, d.revisao, usuario.id));
      }
      case "consentimento": {
        const d = await lerJson(req, esquemas.consentimento);
        await registrarConsentimento(id, d, usuario.id);
        return Response.json({ ok: true });
      }
      case "optout": {
        const d = await lerJson(req, esquemas.optout);
        await registrarOptOut({ leadId: id }, `Registrado manualmente: ${d.motivo}`, usuario.id);
        return Response.json({ ok: true });
      }
      case "contato": {
        if (!(await dentroDoLimite(`contato:${usuario.id}`, 60, 3600_000))) return jsonErro(429, "Muitos contatos iniciados na última hora.");
        const r = await iniciarContato(id, usuario.id);
        return Response.json({ ok: true, mensagemId: r.mensagem.id });
      }
      case "reprocessar": {
        await enfileirar("lead_processar", { leadId: id, forcar: true }, { chave: `reprocessar:${id}`, reabrirSeConcluido: true });
        await auditar(usuario.id, "lead_reprocessar", id);
        return Response.json({ ok: true });
      }
    }
    return jsonErro(404, "Ação desconhecida.");
  } catch (e) {
    if (e instanceof ConflitoEdicao) return jsonErro(409, e.message);
    if (e instanceof EnvioBloqueado) return jsonErro(422, e.message);
    throw e;
  }
});
