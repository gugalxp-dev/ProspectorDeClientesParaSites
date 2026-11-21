// Webhook da Cloud API: valida a assinatura, deduplica e enfileira. O processamento pesado é no worker,
// assim a Meta recebe 200 rápido (ela reenvia o que demora ou falha).
// Docs: https://developers.facebook.com/docs/graph-api/webhooks/getting-started#validate-payloads

import { hmacHex, iguaisSeguro } from "@/lib/crypto";
import { Prisma } from "@/generated/prisma/client";
import { db } from "../db";
import { enfileirar } from "../fila";

export function assinaturaValida(corpoBruto: string, cabecalho: string | null, appSecret: string): boolean {
  if (!cabecalho?.startsWith("sha256=")) return false;
  return iguaisSeguro(cabecalho.slice(7), hmacHex(appSecret, Buffer.from(corpoBruto, "utf8")));
}

export interface EntradaWhatsApp {
  waMessageId: string;
  de: string; // wa_id, só dígitos
  nome?: string;
  texto: string;
  tipoMensagem: string;
  timestamp: number;
}

export interface StatusWhatsApp {
  waMessageId: string;
  status: "sent" | "delivered" | "read" | "failed" | string;
  timestamp: number;
  erro?: string;
}

interface PayloadMeta {
  object?: string;
  entry?: Array<{
    changes?: Array<{
      field?: string;
      value?: {
        contacts?: Array<{ wa_id: string; profile?: { name?: string } }>;
        messages?: Array<{
          id: string;
          from: string;
          timestamp: string;
          type: string;
          text?: { body?: string };
          button?: { text?: string };
          interactive?: { button_reply?: { title?: string }; list_reply?: { title?: string } };
        }>;
        statuses?: Array<{ id: string; status: string; timestamp: string; errors?: Array<{ code?: number; title?: string; message?: string }> }>;
      };
    }>;
  }>;
}

export function extrairEventos(payload: unknown): { entradas: EntradaWhatsApp[]; status: StatusWhatsApp[] } {
  const p = payload as PayloadMeta;
  const entradas: EntradaWhatsApp[] = [];
  const status: StatusWhatsApp[] = [];
  if (p?.object !== "whatsapp_business_account") return { entradas, status };
  for (const e of p.entry ?? []) {
    for (const c of e.changes ?? []) {
      const v = c.value;
      if (!v) continue;
      for (const m of v.messages ?? []) {
        const texto =
          m.text?.body ??
          m.button?.text ??
          m.interactive?.button_reply?.title ??
          m.interactive?.list_reply?.title ??
          `[mensagem do tipo ${m.type} — veja no WhatsApp]`;
        entradas.push({
          waMessageId: m.id,
          de: m.from.replace(/\D/g, ""),
          nome: v.contacts?.find((x) => x.wa_id === m.from)?.profile?.name,
          texto: texto.slice(0, 4096),
          tipoMensagem: m.type,
          timestamp: Number(m.timestamp) * 1000,
        });
      }
      for (const s of v.statuses ?? []) {
        const erro = s.errors?.[0];
        status.push({
          waMessageId: s.id,
          status: s.status,
          timestamp: Number(s.timestamp) * 1000,
          erro: erro ? `${erro.code ?? ""} ${erro.title ?? ""} ${erro.message ?? ""}`.trim() : undefined,
        });
      }
    }
  }
  return { entradas, status };
}

/** Grava cada evento uma única vez (a Meta reenvia) e enfileira o processamento. */
export async function receberEventos(payload: unknown): Promise<{ novos: number; repetidos: number }> {
  const { entradas, status } = extrairEventos(payload);
  const itens = [
    ...entradas.map((e) => ({ idExterno: `msg:${e.waMessageId}`, dados: { tipo: "entrada", ...e } })),
    ...status.map((s) => ({ idExterno: `st:${s.waMessageId}:${s.status}`, dados: { tipo: "status", ...s } })),
  ];
  let novos = 0;
  let repetidos = 0;
  for (const it of itens) {
    try {
      const ev = await db.webhookEvento.create({ data: { provedor: "whatsapp", idExterno: it.idExterno, payload: JSON.stringify(it.dados) } });
      await enfileirar("whatsapp_evento", { eventoId: ev.id }, { chave: `wh:${ev.id}`, maxTentativas: 5 });
      novos++;
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") repetidos++;
      else throw e;
    }
  }
  return { novos, repetidos };
}

/** Monta um payload no formato da Meta. Usado pelo simulador (modo mock) e pelos testes. */
export function payloadSimulado(opcoes: { de: string; texto?: string; nome?: string; status?: { id: string; status: string } }): PayloadMeta {
  const agora = String(Math.floor(Date.now() / 1000));
  return {
    object: "whatsapp_business_account",
    entry: [
      {
        changes: [
          {
            field: "messages",
            value: opcoes.status
              ? { statuses: [{ id: opcoes.status.id, status: opcoes.status.status, timestamp: agora }] }
              : {
                  contacts: [{ wa_id: opcoes.de, profile: { name: opcoes.nome ?? "Cliente" } }],
                  messages: [{ id: `wamid.sim.${Date.now()}.${Math.random().toString(36).slice(2)}`, from: opcoes.de, timestamp: agora, type: "text", text: { body: opcoes.texto ?? "" } }],
                },
          },
        ],
      },
    ],
  };
}
