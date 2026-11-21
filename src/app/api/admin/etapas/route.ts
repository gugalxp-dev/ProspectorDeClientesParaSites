// Etapas do CRM: renomear, reordenar, mudar cor, criar e apagar (as de sistema não podem ser apagadas).

import { z } from "zod";
import { listarEtapas } from "@/core/crm/etapas";
import { db } from "@/core/db";
import { auditar } from "@/lib/auditoria";
import { jsonErro, lerJson, rota } from "@/lib/http";

const CORES = ["slate", "sky", "indigo", "violet", "blue", "cyan", "amber", "rose", "emerald", "zinc", "orange", "teal", "pink", "lime"] as const;

const esquema = z.object({
  etapas: z
    .array(
      z.object({
        id: z.string().max(40).optional(),
        nome: z.string().trim().min(2).max(60),
        cor: z.enum(CORES),
      }),
    )
    .min(1)
    .max(30),
});

export const GET = rota(async () => Response.json(await listarEtapas()));

/** Recebe a lista completa na nova ordem. Etapas fora da lista são apagadas (seus leads vão para "Novo lead"). */
export const PUT = rota(
  async (req, { usuario }) => {
    const { etapas } = await lerJson(req, esquema);
    const atuais = await listarEtapas();
    const removidas = atuais.filter((a) => !etapas.some((e) => e.id === a.id));
    if (removidas.some((r) => r.sistema)) return jsonErro(400, "Etapas usadas pelas automações não podem ser removidas (só renomeadas).");
    const novo = atuais.find((a) => a.chave === "novo")!;
    for (const r of removidas) {
      await db.lead.updateMany({ where: { etapaId: r.id }, data: { etapaId: novo.id } });
      await db.etapaCrm.delete({ where: { id: r.id } });
    }
    for (const [ordem, e] of etapas.entries()) {
      if (e.id && atuais.some((a) => a.id === e.id)) await db.etapaCrm.update({ where: { id: e.id }, data: { nome: e.nome, cor: e.cor, ordem } });
      else await db.etapaCrm.create({ data: { nome: e.nome, cor: e.cor, ordem, chave: `personalizada_${Date.now()}_${ordem}` } });
    }
    await auditar(usuario.id, "etapas_alteradas", null, { etapas: etapas.map((e) => e.nome) });
    return Response.json(await listarEtapas());
  },
  { papel: "admin" },
);
