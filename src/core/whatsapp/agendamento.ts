// Fila de primeiros contatos: você aprova vários de uma vez e o sistema envia um por vez, com intervalo
// aleatório (padrão 3 a 8 min) e só no horário comercial. Imita uma pessoa e protege o número de bloqueio.

import { obterConfig, type ConfigDe } from "../config";
import { db } from "../db";
import { emitir } from "../eventos";
import { enfileirar } from "../fila";
import { EnvioBloqueado, estaSuprimido } from "./conversas";

export const TIPO_JOB = "contato_agendado";
type CfgEnvio = Pick<ConfigDe<"whatsapp">, "envioIntervaloMinMin" | "envioIntervaloMaxMin" | "horaInicio" | "horaFim" | "enviarSabado" | "enviarDomingo">;

function diaPermitido(d: Date, cfg: CfgEnvio): boolean {
  const dia = d.getDay();
  return (dia !== 0 || cfg.enviarDomingo) && (dia !== 6 || cfg.enviarSabado);
}

export function dentroDoHorario(d: Date, cfg: CfgEnvio): boolean {
  return diaPermitido(d, cfg) && d.getHours() >= cfg.horaInicio && d.getHours() < cfg.horaFim;
}

/** Leva um horário para dentro da janela de envio (mesmo dia ou o próximo dia permitido), com alguns minutos de variação. */
export function ajustarAoHorario(d: Date, cfg: CfgEnvio, aleatorio = Math.random): Date {
  const r = new Date(d);
  for (let i = 0; i < 8 && !dentroDoHorario(r, cfg); i++) {
    if (diaPermitido(r, cfg) && r.getHours() < cfg.horaInicio) {
      r.setHours(cfg.horaInicio, Math.floor(aleatorio() * 15), 0, 0);
    } else {
      r.setDate(r.getDate() + 1);
      r.setHours(cfg.horaInicio, Math.floor(aleatorio() * 15), 0, 0);
    }
  }
  return r;
}

/** Próximo horário livre: depois do último envio/agendamento + intervalo aleatório, dentro do horário comercial. */
export function proximoHorario(cfg: CfgEnvio, ultimo: Date | null, agora = new Date(), aleatorio = Math.random): Date {
  const min = Math.min(cfg.envioIntervaloMinMin, cfg.envioIntervaloMaxMin);
  const max = Math.max(cfg.envioIntervaloMinMin, cfg.envioIntervaloMaxMin);
  const intervaloMs = (min + aleatorio() * (max - min)) * 60_000;
  const base = ultimo ? Math.max(agora.getTime(), ultimo.getTime() + intervaloMs) : agora.getTime();
  return ajustarAoHorario(new Date(base), cfg, aleatorio);
}

/** Último primeiro contato enviado ou agendado (para espaçar o próximo). */
async function ultimoMarco(): Promise<Date | null> {
  const [agendado, enviado] = await Promise.all([
    db.job.findFirst({ where: { tipo: TIPO_JOB, status: { in: ["pendente", "rodando"] } }, orderBy: { executarApos: "desc" }, select: { executarApos: true } }),
    db.mensagem.findFirst({ where: { direcao: "saida", tipo: "template", status: { notIn: ["bloqueada", "falhou"] } }, orderBy: { criadoEm: "desc" }, select: { criadoEm: true } }),
  ]);
  const datas = [agendado?.executarApos, enviado?.criadoEm].filter((d): d is Date => !!d);
  return datas.length ? new Date(Math.max(...datas.map((d) => d.getTime()))) : null;
}

/** Ids dos leads com primeiro contato na fila, e quando cada um sai. */
export async function agendados(): Promise<Map<string, Date>> {
  const jobs = await db.job.findMany({ where: { tipo: TIPO_JOB, status: "pendente" }, select: { payload: true, executarApos: true } });
  return new Map(jobs.map((j) => [String((JSON.parse(j.payload) as { leadId: string }).leadId), j.executarApos]));
}

export async function agendarContato(leadId: string, usuarioId: string): Promise<Date> {
  const lead = await db.lead.findUniqueOrThrow({ where: { id: leadId }, include: { conversa: { select: { id: true } } } });
  const tel = lead.whatsappE164 ?? (lead.ehCelular ? lead.telefoneE164 : null);
  if (lead.naoContatar || lead.contatoStatus === "opt_out" || (tel && (await estaSuprimido(tel)))) throw new EnvioBloqueado("Este contato pediu para não receber mensagens.");
  if (!tel) throw new EnvioBloqueado("Lead sem celular/WhatsApp.");
  if (lead.conversa) throw new EnvioBloqueado("Este lead já tem conversa: use a página do lead.");
  const ja = (await agendados()).get(leadId);
  if (ja) return ja;

  const cfg = await obterConfig("whatsapp");
  const previsto = proximoHorario(cfg, await ultimoMarco());
  const job = await enfileirar(TIPO_JOB, { leadId, usuarioId }, { chave: `contato:${leadId}`, atrasoMs: Math.max(0, previsto.getTime() - Date.now()), maxTentativas: 2, reabrirSeConcluido: true });
  const quando = job.executarApos; // o horário exato gravado na fila
  await db.interacaoLead.create({
    data: { leadId, tipo: "contato", descricao: `Primeiro contato agendado para ${quando.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}.`, usuarioId },
  });
  await emitir("lead.atualizado", { id: leadId });
  return quando;
}

export async function cancelarAgendamento(leadId: string): Promise<boolean> {
  const r = await db.job.updateMany({ where: { tipo: TIPO_JOB, chave: `contato:${leadId}`, status: "pendente" }, data: { status: "cancelado" } });
  if (r.count) await emitir("lead.atualizado", { id: leadId });
  return r.count > 0;
}

/** Na hora de enviar: se o worker ficou parado e passou do horário, reagenda para a próxima janela. */
export async function reagendarSeForaDoHorario(leadId: string, usuarioId: string): Promise<boolean> {
  const cfg = await obterConfig("whatsapp");
  if (dentroDoHorario(new Date(), cfg)) return false;
  const quando = proximoHorario(cfg, await ultimoMarco());
  await enfileirar(TIPO_JOB, { leadId, usuarioId }, { chave: `contato:${leadId}:${Date.now()}`, atrasoMs: Math.max(0, quando.getTime() - Date.now()), maxTentativas: 2 });
  return true;
}
