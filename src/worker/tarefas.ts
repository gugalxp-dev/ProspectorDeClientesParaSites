// Manipuladores dos trabalhos da fila. Cada um é idempotente: rodar duas vezes não duplica efeito.

import { responderConversa } from "@/core/agente/agente";
import { descobrir } from "@/core/busca";
import { obterConfig } from "@/core/config";
import { db } from "@/core/db";
import { enfileirar, ErroDefinitivo } from "@/core/fila";
import { ErroConfiguracaoIA, LimiteConsumoExcedido } from "@/core/ia/tipos";
import { aplicarRetencao } from "@/core/lgpd";
import { aplicarFiltro } from "@/core/prospeccao/filtro";
import { processarLead } from "@/core/prospeccao/processar";
import { qualificarLead } from "@/core/prospeccao/qualificacao";
import { EnvioBloqueado, processarEntrada, processarStatus } from "@/core/whatsapp/conversas";
import { receberEventos, payloadSimulado, type EntradaWhatsApp, type StatusWhatsApp } from "@/core/whatsapp/webhook";

export type Manipulador = (payload: Record<string, unknown>) => Promise<void>;

export const MANIPULADORES: Record<string, Manipulador> = {
  async busca_descobrir(p) {
    const { buscaId, fonte } = p as { buscaId: string; fonte: string };
    await descobrir(buscaId, fonte);
  },

  async lead_processar(p) {
    const { leadId, buscaId } = p as { leadId: string; buscaId?: string; forcar?: boolean };
    await processarLead(leadId, buscaId, { forcar: !!p.forcar });
    if (await aplicarFiltro(leadId, buscaId)) return; // sem telefone ou com site bom: não gasta IA
    const cfg = await obterConfig("prospeccao");
    if (cfg.qualificarAutomaticamente) {
      await enfileirar("lead_qualificar", { leadId, buscaId }, { chave: `qualificar:${leadId}:${buscaId ?? "manual"}`, buscaId, maxTentativas: 3, reabrirSeConcluido: !buscaId });
    }
  },

  async lead_qualificar(p) {
    const { leadId, buscaId } = p as { leadId: string; buscaId?: string };
    try {
      const l = await db.lead.findUnique({ where: { id: leadId }, select: { qualificacaoStatus: true } });
      if (!l || l.qualificacaoStatus === "descartado") return;
      await qualificarLead(leadId, buscaId);
    } catch (e) {
      if (e instanceof LimiteConsumoExcedido || e instanceof ErroConfiguracaoIA) throw new ErroDefinitivo((e as Error).message);
      throw e;
    }
  },

  async whatsapp_evento(p) {
    const ev = await db.webhookEvento.findUnique({ where: { id: String(p.eventoId) } });
    if (!ev || ev.processadoEm) return;
    const dados = JSON.parse(ev.payload) as ({ tipo: "entrada" } & EntradaWhatsApp) | ({ tipo: "status" } & StatusWhatsApp);
    try {
      if (dados.tipo === "entrada") await processarEntrada(dados);
      else await processarStatus(dados);
      await db.webhookEvento.update({ where: { id: ev.id }, data: { processadoEm: new Date(), erro: null } });
    } catch (e) {
      await db.webhookEvento.update({ where: { id: ev.id }, data: { erro: (e as Error).message.slice(0, 500) } });
      throw e;
    }
  },

  async agente_responder(p) {
    try {
      await responderConversa(String(p.conversaId), String(p.mensagemId));
    } catch (e) {
      if (e instanceof EnvioBloqueado || e instanceof LimiteConsumoExcedido || e instanceof ErroConfiguracaoIA) {
        throw new ErroDefinitivo((e as Error).message);
      }
      throw e;
    }
  },

  /** Modo simulado: confirma a entrega como a Meta faria, pelo mesmo caminho do webhook. */
  async whatsapp_mock_status(p) {
    const id = String(p.waMessageId);
    await receberEventos(payloadSimulado({ de: "", status: { id, status: "delivered" } }));
  },

  async manutencao_diaria() {
    await aplicarRetencao();
  },
};
