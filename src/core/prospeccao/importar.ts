// Grava empresas descobertas com deduplicação global (entre buscas e entre fontes).
// Ordem de identificação: id na fonte > telefone > domínio do site > nome normalizado + cidade.
// Num lead existente só preenche campos vazios: dados editados ou já verificados não são sobrescritos.
// Toda informação recebida fica registrada em DadoOrigem (de onde veio e quando).

import { hashSecret } from "@/lib/crypto";
import { obterConfig } from "../config";
import { registrarLog } from "../eventos";
import { verificarWhatsApp } from "../whatsapp/cliente";
import { motivoIgnorarNaImportacao } from "./filtro";
import { db } from "../db";
import { semAcento } from "../fontes/osm";
import { classificarWebsite, dominioRegistravel, hostDe } from "../presenca";
import { normalizarTelefone } from "../telefone";
import type { Confianca, LugarBruto, Presenca } from "../tipos";

export interface ResultadoImportacao {
  recebidos: number;
  importados: number;
  novos: number;
  ignorados: number;
  leadIds: string[];
}

const SUFIXOS = /\b(ltda|me|eireli|epp|s\/?a|mei|cia)\b\.?/g;

export function normalizarNome(nome: string): string {
  return semAcento(nome)
    .replace(SUFIXOS, " ")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function hashTelefone(e164: string): string {
  return hashSecret(`tel:${e164}`);
}

async function encontrarExistente(l: LugarBruto, e164: string | null, dominio: string | null, nomeN: string, cidade: string) {
  const origem = await db.leadOrigem.findUnique({ where: { fonte_idExterno: { fonte: l.fonte, idExterno: l.idExterno } } });
  if (origem) return db.lead.findUnique({ where: { id: origem.leadId } });
  if (e164) {
    const t = await db.lead.findFirst({ where: { OR: [{ telefoneE164: e164 }, { whatsappE164: e164 }] } });
    if (t) return t;
  }
  if (dominio) {
    const d = await db.lead.findFirst({ where: { dominio } });
    if (d) return d;
  }
  return db.lead.findFirst({ where: { nomeNormalizado: nomeN, cidade } });
}

/** Confiança de "sem site": cresce quando mais de uma fonte confirma a ausência. */
export function confiancaSemSite(fontesSemSite: number): Confianca {
  return fontesSemSite >= 2 ? "media" : "baixa";
}

// Importações em série neste processo: duas pesquisas simultâneas achando a mesma empresa
// não podem criar dois leads (a busca do existente e a criação precisam acontecer juntas).
let fila: Promise<unknown> = Promise.resolve();

export function importarLugares(buscaId: string, nicho: string, cidade: string, lugares: LugarBruto[]): Promise<ResultadoImportacao> {
  const vez = fila.then(() => importarSemConcorrencia(buscaId, nicho, cidade, lugares));
  fila = vez.catch(() => undefined);
  return vez;
}

async function importarSemConcorrencia(buscaId: string, nicho: string, cidade: string, lugares: LugarBruto[]): Promise<ResultadoImportacao> {
  const res: ResultadoImportacao = { recebidos: lugares.length, importados: 0, novos: 0, ignorados: 0, leadIds: [] };
  const cfg = await obterConfig("prospeccao");

  for (const l of lugares) {
    if (l.ativo === false || !l.nome?.trim()) {
      res.ignorados++;
      continue;
    }
    const telFonte = normalizarTelefone(l.telefone);
    // Telefone vindo da busca por IA só vale se existir no WhatsApp (IA pode errar ou inventar número).
    // Sem como verificar agora (Baileys desconectado), fica como veio e passa pelos filtros normais.
    const conferido = l.fonte === "web" && telFonte.e164 ? await verificarWhatsApp(telFonte.e164) : null;
    if (conferido === false) await registrarLog("info", "filtro", `${l.nome}: telefone ${telFonte.formatado ?? l.telefone} (da busca por IA) não tem WhatsApp, descartado.`, { buscaId });
    const tel = conferido === false ? normalizarTelefone(null) : telFonte;
    const site = classificarWebsite(l.website);
    const dominio = site.presenca === "com_site" && l.website ? dominioRegistravel(hostDe(l.website)) : null;
    const nomeN = normalizarNome(l.nome);
    const cidadeLead = l.cidade?.trim() || cidade;

    // Nem registra quem não se enquadra (rede/franquia, sem celular e sem site para procurar um).
    // Fixo pode ter WhatsApp Business: com o Baileys conectado, pergunta ao próprio WhatsApp antes de descartar.
    const waFixo = conferido === true ? tel.e164 : cfg.exigirCelular && !tel.ehCelular && tel.e164 && (await verificarWhatsApp(tel.e164)) ? tel.e164 : null;
    const ignorar = motivoIgnorarNaImportacao({ nome: l.nome, rede: l.rede, ehCelular: tel.ehCelular || !!waFixo, temSite: site.presenca === "com_site" }, cfg);
    if (ignorar) {
      res.ignorados++;
      await registrarLog("info", "filtro", `${l.nome}: ignorado (${ignorar})`, { buscaId });
      continue;
    }

    const existente = await encontrarExistente(l, tel.e164, dominio, nomeN, cidadeLead);
    const suprimido = tel.e164 ? await db.supressao.findUnique({ where: { telefoneHash: hashTelefone(tel.e164) } }) : null;
    const redeDoSite = site.rede && l.website ? { [site.rede]: l.website } : {};
    let leadId: string;

    if (existente) {
      leadId = existente.id;
      const ganhouSite = !existente.website && !!l.website;
      await db.lead.update({
        where: { id: existente.id },
        data: {
          categoria: existente.categoria ?? l.categoria ?? null,
          endereco: existente.endereco ?? l.endereco ?? null,
          uf: existente.uf ?? l.uf ?? null,
          lat: existente.lat ?? l.lat ?? null,
          lon: existente.lon ?? l.lon ?? null,
          telefone: existente.telefone ?? tel.formatado ?? l.telefone ?? null,
          telefoneE164: existente.telefoneE164 ?? tel.e164,
          ehCelular: existente.ehCelular || (!existente.telefoneE164 && tel.ehCelular),
          whatsappE164: existente.whatsappE164 ?? waFixo,
          emails: existente.emails ?? (l.emails?.length ? l.emails.join(", ") : null),
          instagram: existente.instagram ?? l.instagram ?? (redeDoSite as { instagram?: string }).instagram ?? null,
          facebook: existente.facebook ?? l.facebook ?? (redeDoSite as { facebook?: string }).facebook ?? null,
          ...(ganhouSite
            ? { website: l.website, dominio, presenca: site.presenca, presencaConfianca: "alta", siteAvaliadoEm: null }
            : {}),
          ...(suprimido ? { naoContatar: true, contatoStatus: "opt_out" } : {}),
        },
      });
    } else {
      const presenca: Presenca = site.presenca;
      const criado = await db.lead.create({
        data: {
          nome: l.nome.trim(),
          nomeNormalizado: nomeN,
          categoria: l.categoria ?? null,
          segmento: nicho,
          endereco: l.endereco ?? null,
          cidade: cidadeLead,
          uf: l.uf ?? null,
          lat: l.lat ?? null,
          lon: l.lon ?? null,
          telefone: tel.formatado ?? l.telefone ?? null, // padronizado: (13) 99157-7715
          telefoneE164: tel.e164,
          ehCelular: tel.ehCelular,
          whatsappE164: waFixo,
          emails: l.emails?.length ? l.emails.join(", ") : null,
          website: l.website ?? null,
          dominio,
          instagram: l.instagram ?? (redeDoSite as { instagram?: string }).instagram ?? null,
          facebook: l.facebook ?? (redeDoSite as { facebook?: string }).facebook ?? null,
          presenca,
          presencaConfianca: presenca === "sem_site_identificado" ? "baixa" : "alta",
          etapaId: null, // só entra no CRM depois de passar pelo filtro (prospeccao/filtro.ts)
          ...(suprimido ? { naoContatar: true, contatoStatus: "opt_out" } : {}),
        },
      });
      leadId = criado.id;
      res.novos++;
    }

    await db.leadOrigem.upsert({
      where: { fonte_idExterno: { fonte: l.fonte, idExterno: l.idExterno } },
      create: { leadId, fonte: l.fonte, idExterno: l.idExterno, url: l.url ?? null },
      update: { coletadoEm: new Date() },
    });
    await registrarDados(leadId, l.fonte, l.url ?? null, {
      nome: l.nome,
      telefone: tel.e164 ?? l.telefone,
      website: l.website,
      email: l.emails,
      endereco: l.endereco,
      instagram: l.instagram,
      facebook: l.facebook,
      categoria: l.categoria,
    });
    await atualizarConfiancaSemSite(leadId);

    try {
      await db.buscaLead.create({ data: { buscaId, leadId, novo: !existente } });
    } catch {
      // já ligado a esta busca (mesma empresa vinda de duas fontes)
    }
    res.importados++;
    if (!res.leadIds.includes(leadId)) res.leadIds.push(leadId);
  }
  return res;
}

export async function registrarDados(
  leadId: string,
  fonte: string,
  url: string | null,
  campos: Record<string, string | string[] | null | undefined>,
): Promise<void> {
  for (const [campo, v] of Object.entries(campos)) {
    for (const valor of (Array.isArray(v) ? v : [v]).filter((x): x is string => !!x && !!x.trim())) {
      await db.dadoOrigem.upsert({
        where: { leadId_campo_valor_fonte: { leadId, campo, valor: valor.trim().slice(0, 500), fonte } },
        create: { leadId, campo, valor: valor.trim().slice(0, 500), fonte, url },
        update: { coletadoEm: new Date(), url },
      });
    }
  }
}

/** Lead sem site: quantas fontes diferentes o viram sem site define a confiança. */
async function atualizarConfiancaSemSite(leadId: string): Promise<void> {
  const lead = await db.lead.findUnique({ where: { id: leadId }, select: { presenca: true, website: true } });
  if (!lead || lead.presenca !== "sem_site_identificado" || lead.website) return;
  const fontes = await db.leadOrigem.groupBy({ by: ["fonte"], where: { leadId } });
  await db.lead.update({ where: { id: leadId }, data: { presencaConfianca: confiancaSemSite(fontes.length) } });
}
