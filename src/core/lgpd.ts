// Política de retenção (LGPD): roda uma vez por dia no worker. Prazos em Admin > LGPD.
// - leads nunca contatados e sem autorização são apagados após N dias
// - mensagens antigas são apagadas; logs e eventos técnicos também
// A lista de supressão (opt-out) nunca é apagada: é ela que garante o "não me mande mais".

import { limparSessoesExpiradas } from "@/lib/auth-limpeza";
import { limparLimitesAntigos } from "@/lib/limite";
import { obterConfig } from "./config";
import { idEtapa } from "./crm/etapas";
import { db } from "./db";
import { limparEventosAntigos, registrarLog } from "./eventos";

const dias = (n: number) => new Date(Date.now() - n * 86_400_000);

export async function aplicarRetencao(): Promise<Record<string, number>> {
  const cfg = await obterConfig("lgpd");
  const fechado = await idEtapa("fechado");

  const leads = await db.lead.deleteMany({
    where: {
      criadoEm: { lt: dias(cfg.retencaoDiasLeadsSemContato) },
      contatoStatus: "sem_autorizacao",
      conversa: null,
      NOT: { etapaId: fechado },
    },
  });
  const mensagens = await db.mensagem.deleteMany({ where: { criadoEm: { lt: dias(cfg.retencaoDiasMensagens) } } });
  const logs = await db.logOperacao.deleteMany({ where: { criadoEm: { lt: dias(cfg.retencaoDiasLogs) } } });
  const webhooks = await db.webhookEvento.deleteMany({ where: { criadoEm: { lt: dias(Math.min(30, cfg.retencaoDiasLogs)) } } });
  const jobs = await db.job.deleteMany({ where: { status: { in: ["ok", "cancelado"] }, atualizadoEm: { lt: dias(7) } } });
  await db.chaveIdempotencia.deleteMany({ where: { criadoEm: { lt: dias(2) } } });
  await limparEventosAntigos(24);
  await limparLimitesAntigos();
  await limparSessoesExpiradas();

  const r = { leads: leads.count, mensagens: mensagens.count, logs: logs.count, webhooks: webhooks.count, jobs: jobs.count };
  await registrarLog("info", "lgpd", `Retenção aplicada: ${JSON.stringify(r)}`);
  return r;
}
