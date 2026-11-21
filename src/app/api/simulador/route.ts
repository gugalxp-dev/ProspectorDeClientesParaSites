// Simulador (modo mock): o "cliente" manda a primeira mensagem para um lead que ainda não tem conversa.

import { z } from "zod";
import { db } from "@/core/db";
import { modoWhatsApp } from "@/core/whatsapp/cliente";
import { payloadSimulado, receberEventos } from "@/core/whatsapp/webhook";
import { jsonErro, lerJson, rota } from "@/lib/http";

const esquema = z.object({ leadId: z.string().min(1).max(40), texto: z.string().trim().min(1).max(4000) });

export const POST = rota(async (req) => {
  if ((await modoWhatsApp()) !== "mock") return jsonErro(404, "Simulador disponível só no modo mock.");
  const { leadId, texto } = await lerJson(req, esquema);
  const lead = await db.lead.findUnique({ where: { id: leadId } });
  const tel = lead?.whatsappE164 ?? (lead?.ehCelular ? lead.telefoneE164 : null);
  if (!tel) return jsonErro(422, "O lead não tem celular/WhatsApp para simular.");
  await receberEventos(payloadSimulado({ de: tel.replace(/\D/g, ""), texto, nome: lead!.nome }));
  return Response.json({ ok: true });
});
