// Camada de comunicação com o WhatsApp. Só a API oficial (WhatsApp Business Cloud API da Meta).
// Sem credenciais, roda em modo "mock": nada sai do computador, e o simulador do painel faz o papel do cliente.
// Docs: https://developers.facebook.com/docs/whatsapp/cloud-api/reference/messages

import { env } from "@/lib/env";
import { mascararSegredos } from "@/lib/log";
import { randomToken } from "@/lib/crypto";
import { credencial } from "../segredos";

export interface ResultadoEnvio {
  id: string;
}

export interface ClienteWhatsApp {
  modo: "cloud" | "mock";
  enviarTexto(paraE164: string, texto: string): Promise<ResultadoEnvio>;
  enviarTemplate(paraE164: string, nome: string, idioma: string, parametros: string[]): Promise<ResultadoEnvio>;
  estado(): Promise<{ ok: boolean; detalhe: string }>;
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

export async function modoWhatsApp(): Promise<"cloud" | "mock"> {
  const m = env().WHATSAPP_MODO;
  if (m) return m;
  const [token, phone] = await Promise.all([credencial("WHATSAPP_TOKEN"), credencial("WHATSAPP_PHONE_NUMBER_ID")]);
  return token && phone ? "cloud" : "mock";
}

export async function clienteWhatsApp(): Promise<ClienteWhatsApp> {
  if (forcado) return forcado;
  if ((await modoWhatsApp()) === "mock") return new ClienteMock();
  const [token, phone] = await Promise.all([credencial("WHATSAPP_TOKEN"), credencial("WHATSAPP_PHONE_NUMBER_ID")]);
  if (!token || !phone) throw new ErroWhatsApp("WHATSAPP_MODO=cloud, mas WHATSAPP_TOKEN ou WHATSAPP_PHONE_NUMBER_ID não estão configurados.", null, true);
  return new ClienteCloud(token, phone);
}
