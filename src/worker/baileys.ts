// Conexão WhatsApp via Baileys (lib gratuita, NÃO oficial). Só roda com WHATSAPP_MODO=baileys.
// O worker é o dono do socket: mensagens recebidas e confirmações de entrega entram pelo MESMO caminho
// do webhook da Meta (receberEventos), então dedup, opt-out, agente e transferência continuam iguais.
// O painel conversa com este processo por uma ponte HTTP em 127.0.0.1 (envio manual, QR code, estado).
// Sessão salva em data/baileys-auth (fora do Git). Risco: a Meta pode banir números que usam libs não oficiais.

import { rm } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  isLidUser,
  isPnUser,
  jidNormalizedUser,
  useMultiFileAuthState,
  type WAMessage,
  type WASocket,
} from "baileys";
import QRCode from "qrcode";
import { env } from "@/lib/env";
import { iguaisSeguro } from "@/lib/crypto";
import { log, mensagemErro } from "@/lib/log";
import { ErroWhatsApp, registrarClienteLocal, tokenPonteBaileys, type ClienteWhatsApp, type EstadoBaileys, type ResultadoEnvio } from "@/core/whatsapp/cliente";
import { receberEventos } from "@/core/whatsapp/webhook";

const PASTA_SESSAO = "data/baileys-auth";

let sock: WASocket | null = null;
let estado: EstadoBaileys = { conectado: false, qr: null, numero: null, detalhe: "Iniciando conexão Baileys..." };
let parando = false;

// Baileys loga muito; só repassamos avisos e erros.
const logger = {
  level: "warn",
  child() {
    return logger;
  },
  trace() {},
  debug() {},
  info() {},
  warn(obj: unknown, msg?: string) {
    log.aviso(`baileys: ${msg ?? ""}`, { detalhe: String((obj as { msg?: string })?.msg ?? "") });
  },
  error(obj: unknown, msg?: string) {
    log.erro(`baileys: ${msg ?? ""}`, { detalhe: mensagemErro((obj as { err?: unknown })?.err ?? obj) });
  },
};

// ───────────── Conversões para o formato do webhook da Meta ─────────────

function textoDa(m: WAMessage): { texto: string; tipo: string } {
  const c = m.message ?? {};
  const msg = c.ephemeralMessage?.message ?? c.viewOnceMessage?.message ?? c;
  const texto =
    msg.conversation ??
    msg.extendedTextMessage?.text ??
    msg.buttonsResponseMessage?.selectedDisplayText ??
    msg.listResponseMessage?.title ??
    msg.imageMessage?.caption ??
    msg.videoMessage?.caption ??
    null;
  const tipo = Object.keys(msg).find((k) => k !== "messageContextInfo") ?? "desconhecido";
  return { texto: texto ?? `[mensagem do tipo ${tipo} — veja no WhatsApp]`, tipo: texto ? "text" : tipo };
}

/** Número (só dígitos) de quem mandou. Contas novas chegam como LID; tenta achar o telefone real. */
async function telefoneDe(m: WAMessage): Promise<string | null> {
  const jid = m.key.remoteJid ?? "";
  if (isPnUser(jid)) return jidNormalizedUser(jid).split("@")[0];
  if (isLidUser(jid)) {
    const alt = m.key.remoteJidAlt;
    if (alt && isPnUser(alt)) return jidNormalizedUser(alt).split("@")[0];
    const pn = await sock?.signalRepository.lidMapping.getPNForLID(jid).catch(() => null);
    if (pn) return jidNormalizedUser(pn).split("@")[0].split(":")[0];
  }
  return null;
}

async function aoReceber(mensagens: WAMessage[]) {
  for (const m of mensagens) {
    if (m.key.fromMe || !m.message || !m.key.id) continue;
    const jid = m.key.remoteJid ?? "";
    if (!isPnUser(jid) && !isLidUser(jid)) continue; // grupos, status, canais
    const de = await telefoneDe(m);
    if (!de) {
      log.aviso("baileys: mensagem de contato sem telefone conhecido (LID) ignorada", { jid });
      continue;
    }
    const { texto, tipo } = textoDa(m);
    const ts = String(Number(m.messageTimestamp ?? Math.floor(Date.now() / 1000)));
    await receberEventos({
      object: "whatsapp_business_account",
      entry: [
        {
          changes: [
            {
              field: "messages",
              value: {
                contacts: [{ wa_id: de, profile: { name: m.pushName ?? undefined } }],
                messages: [{ id: m.key.id, from: de, timestamp: ts, type: tipo, text: { body: texto } }],
              },
            },
          ],
        },
      ],
    });
  }
}

// Status do protocolo: 0 erro, 1 pendente, 2 servidor, 3 entregue, 4 lida, 5 ouvida.
const STATUS: Record<number, string> = { 0: "failed", 2: "sent", 3: "delivered", 4: "read", 5: "read" };

async function aoAtualizar(atualizacoes: Array<{ key: WAMessage["key"]; update: Partial<WAMessage> }>) {
  const statuses = atualizacoes
    .filter((a) => a.key.fromMe && a.key.id && typeof a.update.status === "number" && STATUS[a.update.status])
    .map((a) => ({ id: a.key.id!, status: STATUS[a.update.status as number], timestamp: String(Math.floor(Date.now() / 1000)) }));
  if (statuses.length) {
    await receberEventos({ object: "whatsapp_business_account", entry: [{ changes: [{ field: "messages", value: { statuses } }] }] });
  }
}

// ───────────── Socket ─────────────

async function conectar(): Promise<void> {
  const { state, saveCreds } = await useMultiFileAuthState(PASTA_SESSAO);
  const { version } = await fetchLatestBaileysVersion().catch(() => ({ version: undefined }));
  const s = makeWASocket({ auth: state, logger, version, markOnlineOnConnect: false, syncFullHistory: false, browser: ["Prospector", "Chrome", "1.0"] });
  sock = s;

  s.ev.on("creds.update", saveCreds);
  s.ev.on("connection.update", async ({ connection, qr, lastDisconnect }) => {
    if (qr) {
      estado = { conectado: false, qr: await QRCode.toDataURL(qr, { margin: 1, width: 280 }), numero: null, detalhe: "Escaneie o QR code no WhatsApp do celular (Aparelhos conectados)." };
    }
    if (connection === "open") {
      const numero = s.user?.id ? jidNormalizedUser(s.user.id).split("@")[0] : null;
      estado = { conectado: true, qr: null, numero, detalhe: `Conectado via Baileys · +${numero ?? "?"}` };
      log.info("baileys conectado", { numero });
    }
    if (connection === "close") {
      const codigo = (lastDisconnect?.error as { output?: { statusCode?: number } } | undefined)?.output?.statusCode;
      sock = null;
      if (parando) return;
      if (codigo === DisconnectReason.loggedOut) {
        log.aviso("baileys: número desconectado no celular; apagando sessão e gerando novo QR");
        await rm(PASTA_SESSAO, { recursive: true, force: true });
        estado = { conectado: false, qr: null, numero: null, detalhe: "Sessão encerrada. Gerando novo QR code..." };
        void conectar();
      } else {
        estado = { ...estado, conectado: false, detalhe: `Conexão caiu (código ${codigo ?? "?"}). Reconectando...` };
        setTimeout(() => void conectar().catch((e) => log.erro("baileys: falha ao reconectar", { erro: mensagemErro(e) })), 3000);
      }
    }
  });
  s.ev.on("messages.upsert", ({ messages, type }) => {
    if (type !== "notify") return;
    aoReceber(messages).catch((e) => log.erro("baileys: falha ao registrar mensagem recebida", { erro: mensagemErro(e) }));
  });
  s.ev.on("messages.update", (u) => {
    aoAtualizar(u).catch((e) => log.erro("baileys: falha ao registrar status", { erro: mensagemErro(e) }));
  });
}

async function enviarTexto(paraE164: string, texto: string): Promise<ResultadoEnvio> {
  if (!sock || !estado.conectado) throw new ErroWhatsApp("WhatsApp (Baileys) não está conectado. Escaneie o QR code em Admin > WhatsApp.", null, false);
  const digitos = paraE164.replace(/\D/g, "");
  // Confirma que o número tem WhatsApp e pega o JID certo (resolve o nono dígito de celulares antigos).
  const [r] = (await sock.onWhatsApp(digitos)) ?? [];
  if (!r?.exists) throw new ErroWhatsApp(`O número +${digitos} não tem WhatsApp.`, null, true);
  const enviada = await sock.sendMessage(r.jid, { text: texto });
  if (!enviada?.key.id) throw new ErroWhatsApp("Baileys não devolveu o id da mensagem.", null, false);
  return { id: enviada.key.id };
}

const clienteLocal: ClienteWhatsApp = {
  modo: "baileys",
  enviarTexto,
  enviarTemplate(para, nome, _idioma, _parametros, textoAlternativo) {
    if (!textoAlternativo) throw new ErroWhatsApp(`Baileys não tem templates: falta o texto para "${nome}".`, null, true);
    return enviarTexto(para, textoAlternativo);
  },
  async estado() {
    return { ok: estado.conectado, detalhe: estado.detalhe };
  },
  async temWhatsApp(paraE164) {
    if (!sock || !estado.conectado) return null;
    const [r] = (await sock.onWhatsApp(paraE164.replace(/D/g, ""))) ?? [];
    return !!r?.exists;
  },
};

// ───────────── Ponte HTTP (só 127.0.0.1) ─────────────

function responder(res: ServerResponse, status: number, dados: unknown) {
  res.writeHead(status, { "Content-Type": "application/json" }).end(JSON.stringify(dados));
}

async function lerCorpo(req: IncomingMessage): Promise<Record<string, unknown>> {
  let corpo = "";
  for await (const parte of req) {
    corpo += parte;
    if (corpo.length > 64_000) throw new Error("corpo grande demais");
  }
  return corpo ? (JSON.parse(corpo) as Record<string, unknown>) : {};
}

function iniciarPonte() {
  const token = tokenPonteBaileys();
  const servidor = createServer(async (req, res) => {
    if (!iguaisSeguro(String(req.headers["x-ponte-token"] ?? ""), token)) return responder(res, 401, { erro: "Token da ponte inválido." });
    try {
      if (req.method === "GET" && req.url === "/estado") return responder(res, 200, estado);
      if (req.method === "POST" && req.url === "/enviar") {
        const { para, texto } = await lerCorpo(req);
        if (typeof para !== "string" || typeof texto !== "string" || !texto.trim()) return responder(res, 400, { erro: "para e texto são obrigatórios.", definitivo: true });
        return responder(res, 200, await enviarTexto(para, texto.slice(0, 4096)));
      }
      if (req.method === "POST" && req.url === "/sair") {
        await sock?.logout().catch(() => undefined); // dispara "loggedOut", que apaga a sessão e gera novo QR
        return responder(res, 200, { ok: true });
      }
      responder(res, 404, { erro: "Não encontrado." });
    } catch (e) {
      responder(res, 502, { erro: mensagemErro(e), definitivo: e instanceof ErroWhatsApp ? e.definitivo : false });
    }
  });
  servidor.on("error", (e) => log.erro("baileys: ponte HTTP não subiu", { erro: mensagemErro(e), porta: env().BAILEYS_PORTA }));
  servidor.listen(env().BAILEYS_PORTA, "127.0.0.1");
  return servidor;
}

/** Sobe a conexão e a ponte. Devolve a função de encerramento. */
export async function iniciarBaileys(): Promise<() => Promise<void>> {
  registrarClienteLocal(clienteLocal);
  const ponte = iniciarPonte();
  await conectar();
  log.info("baileys iniciado", { porta: env().BAILEYS_PORTA });
  return async () => {
    parando = true;
    ponte.close();
    sock?.end(undefined);
  };
}
