// Camada de comunicação com o WhatsApp.
// - "cloud": API oficial (WhatsApp Business Cloud API da Meta).
// - "baileys": lib gratuita e NÃO oficial (número comum conectado por QR code). A conexão vive no worker
//   (src/worker/baileys.ts); o painel fala com ela por uma ponte HTTP em 127.0.0.1.
// - "mock": nada sai do computador, e o simulador do painel faz o papel do cliente.
// Docs: https://developers.facebook.com/docs/whatsapp/cloud-api/reference/messages

import { env } from "@/lib/env";
import { mascararSegredos } from "@/lib/log";
import { hmacHex, randomToken } from "@/lib/crypto";
import { credencial } from "../segredos";

export type ModoWhatsApp = "cloud" | "baileys" | "mock";

export interface ResultadoEnvio {
  id: string;
}

export interface ClienteWhatsApp {
  modo: ModoWhatsApp;
  enviarTexto(paraE164: string, texto: string): Promise<ResultadoEnvio>;
  /** `textoAlternativo`: o que o Baileys envia no lugar do template (ele não tem templates). */
  enviarTemplate(paraE164: string, nome: string, idioma: string, parametros: string[], textoAlternativo?: string): Promise<ResultadoEnvio>;
  estado(): Promise<{ ok: boolean; detalhe: string }>;
  /** Pergunta ao WhatsApp se o número tem conta. null = não dá para saber agora (ex.: desconectado). Só no Baileys. */
  temWhatsApp?(paraE164: string): Promise<boolean | null>;
}

/** Erro devolvido pela Meta. `definitivo` = não adianta tentar de novo. */
export class ErroWhatsApp extends Error {
  constructor(
    mensagem: string,
    public codigo: number | null,
    public definitivo: boolean,
  ) {
    super(mensagem);
  }
}

// Códigos da Cloud API: https://developers.facebook.com/docs/whatsapp/cloud-api/support/error-codes
const TEMPORARIOS = new Set([1, 2, 4, 80007, 130429, 131016, 131048, 131056, 133004]);

const digitos = (e164: string) => e164.replace(/\D/g, "");

class ClienteCloud implements ClienteWhatsApp {
  modo = "cloud" as const;
  constructor(
    private token: string,
    private phoneNumberId: string,
  ) {}

  private url(caminho: string) {
    return `https://graph.facebook.com/${env().WHATSAPP_API_VERSION}/${caminho}`;
  }

  private async enviar(corpo: Record<string, unknown>): Promise<ResultadoEnvio> {
    let r: Response;
    try {
      r = await fetch(this.url(`${this.phoneNumberId}/messages`), {
        method: "POST",
        headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", ...corpo }),
        signal: AbortSignal.timeout(30_000),
      });
    } catch (e) {
      throw new ErroWhatsApp(`Meta inacessível: ${(e as Error).message}`, null, false);
    }
    const dados = (await r.json().catch(() => ({}))) as { messages?: Array<{ id: string }>; error?: { message?: string; code?: number } };
    if (!r.ok || !dados.messages?.[0]?.id) {
      const codigo = dados.error?.code ?? null;
      const msg = mascararSegredos(`WhatsApp HTTP ${r.status}${codigo ? ` (código ${codigo})` : ""}: ${dados.error?.message ?? "sem detalhe"}`);
      throw new ErroWhatsApp(msg, codigo, !(r.status >= 500 || (codigo !== null && TEMPORARIOS.has(codigo))));
    }
    return { id: dados.messages[0].id };
  }

  enviarTexto(para: string, texto: string) {
    return this.enviar({ to: digitos(para), type: "text", text: { preview_url: false, body: texto } });
  }

  enviarTemplate(para: string, nome: string, idioma: string, parametros: string[]) {
    return this.enviar({
      to: digitos(para),
      type: "template",
      template: {
        name: nome,
        language: { code: idioma },
        ...(parametros.length ? { components: [{ type: "body", parameters: parametros.map((p) => ({ type: "text", text: p })) }] } : {}),
      },
    });
  }

  async estado() {
    try {
      const r = await fetch(this.url(`${this.phoneNumberId}?fields=display_phone_number,verified_name,quality_rating`), {
        headers: { Authorization: `Bearer ${this.token}` },
        signal: AbortSignal.timeout(15_000),
      });
      const d = (await r.json()) as { display_phone_number?: string; verified_name?: string; quality_rating?: string; error?: { message?: string } };
      if (!r.ok) return { ok: false, detalhe: mascararSegredos(d.error?.message ?? `HTTP ${r.status}`) };
      return { ok: true, detalhe: `${d.verified_name ?? "?"} · ${d.display_phone_number ?? "?"} · qualidade ${d.quality_rating ?? "?"}` };
    } catch (e) {
      return { ok: false, detalhe: `Meta inacessível: ${(e as Error).message}` };
    }
  }
}

class ClienteMock implements ClienteWhatsApp {
  modo = "mock" as const;
  async enviarTexto(): Promise<ResultadoEnvio> {
    return { id: `mock.${randomToken(12)}` };
  }
  async enviarTemplate(): Promise<ResultadoEnvio> {
    return { id: `mock.${randomToken(12)}` };
  }
  async estado() {
    return { ok: true, detalhe: "Modo simulado: nenhuma mensagem sai do computador. Use o simulador na conversa do lead." };
  }
}

let forcado: ClienteWhatsApp | null = null;
/** Só para testes. */
export function forcarClienteWhatsApp(c: ClienteWhatsApp | null): void {
  forcado = c;
}

export async function modoWhatsApp(): Promise<ModoWhatsApp> {
  const m = env().WHATSAPP_MODO;
  if (m) return m;
  const [token, phone] = await Promise.all([credencial("WHATSAPP_TOKEN"), credencial("WHATSAPP_PHONE_NUMBER_ID")]);
  return token && phone ? "cloud" : "mock";
}

export async function clienteWhatsApp(): Promise<ClienteWhatsApp> {
  if (forcado) return forcado;
  const modo = await modoWhatsApp();
  if (modo === "mock") return new ClienteMock();
  if (modo === "baileys") return clienteLocal ?? new ClienteBaileysRemoto();
  const [token, phone] = await Promise.all([credencial("WHATSAPP_TOKEN"), credencial("WHATSAPP_PHONE_NUMBER_ID")]);
  if (!token || !phone) throw new ErroWhatsApp("WHATSAPP_MODO=cloud, mas WHATSAPP_TOKEN ou WHATSAPP_PHONE_NUMBER_ID não estão configurados.", null, true);
  return new ClienteCloud(token, phone);
}

// ───────────── Baileys (ponte painel → worker) ─────────────

export interface EstadoBaileys {
  conectado: boolean;
  /** QR code (data URL PNG) enquanto espera o pareamento. */
  qr: string | null;
  numero: string | null;
  detalhe: string;
}

let clienteLocal: ClienteWhatsApp | null = null;
/** O worker registra aqui a conexão Baileys dele, para enviar sem passar pela ponte. */
export function registrarClienteLocal(c: ClienteWhatsApp | null): void {
  clienteLocal = c;
}

/**
 * O número tem WhatsApp? Só responde no worker com o Baileys conectado (a prospecção roda lá).
 * Serve para não descartar telefone fixo que usa WhatsApp Business. null = não foi possível verificar.
 */
export async function verificarWhatsApp(e164: string): Promise<boolean | null> {
  if (!clienteLocal?.temWhatsApp) return null;
  try {
    return await clienteLocal.temWhatsApp(e164);
  } catch {
    return null;
  }
}

/** Token da ponte local, derivado do AUTH_SECRET (painel e worker leem o mesmo .env). */
export function tokenPonteBaileys(): string {
  return hmacHex(env().AUTH_SECRET ?? "", "ponte-baileys");
}

async function chamarPonte<T>(caminho: string, corpo?: unknown): Promise<T> {
  let r: Response;
  try {
    r = await fetch(`http://127.0.0.1:${env().BAILEYS_PORTA}${caminho}`, {
      method: corpo === undefined ? "GET" : "POST",
      headers: { "x-ponte-token": tokenPonteBaileys(), "Content-Type": "application/json" },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    throw new ErroWhatsApp("Worker inacessível: a conexão Baileys roda no worker (npm run iniciar ou npm run worker).", null, false);
  }
  const dados = (await r.json().catch(() => ({}))) as T & { erro?: string; definitivo?: boolean };
  if (!r.ok) throw new ErroWhatsApp(dados.erro ?? `Ponte Baileys HTTP ${r.status}`, null, dados.definitivo ?? false);
  return dados;
}

class ClienteBaileysRemoto implements ClienteWhatsApp {
  modo = "baileys" as const;
  enviarTexto(para: string, texto: string) {
    return chamarPonte<ResultadoEnvio>("/enviar", { para, texto });
  }
  enviarTemplate(para: string, nome: string, _idioma: string, _parametros: string[], textoAlternativo?: string) {
    if (!textoAlternativo) throw new ErroWhatsApp(`Baileys não tem templates: falta o texto para "${nome}".`, null, true);
    return this.enviarTexto(para, textoAlternativo);
  }
  async estado() {
    try {
      const e = await estadoBaileys();
      return { ok: e.conectado, detalhe: e.detalhe };
    } catch (e) {
      return { ok: false, detalhe: (e as Error).message };
    }
  }
}

export function estadoBaileys(): Promise<EstadoBaileys> {
  return chamarPonte<EstadoBaileys>("/estado");
}

/** Desconecta o número e apaga a sessão salva (o próximo pareamento pede QR de novo). */
export function desconectarBaileys(): Promise<{ ok: true }> {
  return chamarPonte<{ ok: true }>("/sair", {});
}
