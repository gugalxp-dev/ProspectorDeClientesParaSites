// Webhook público da Meta. Proteções: verify token (GET), assinatura HMAC do corpo bruto com o App Secret (POST),
// deduplicação por id do evento e limite de tamanho. Responde 200 rápido; o processamento vai para a fila.

import { credencial } from "@/core/segredos";
import { assinaturaValida, receberEventos } from "@/core/whatsapp/webhook";
import { iguaisSeguro } from "@/lib/crypto";
import { log, mensagemErro } from "@/lib/log";
import { registrarLog } from "@/core/eventos";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const u = new URL(req.url).searchParams;
  const esperado = await credencial("WHATSAPP_VERIFY_TOKEN");
  const token = u.get("hub.verify_token") ?? "";
  if (u.get("hub.mode") === "subscribe" && esperado && iguaisSeguro(token, esperado)) {
    return new Response(u.get("hub.challenge") ?? "", { status: 200, headers: { "content-type": "text/plain" } });
  }
  return new Response("Proibido", { status: 403 });
}

const LIMITE = 1024 * 1024;

export async function POST(req: Request) {
  const segredo = await credencial("WHATSAPP_APP_SECRET");
  if (!segredo) {
    log.aviso("webhook recebido sem WHATSAPP_APP_SECRET configurado: ignorado");
    return new Response("Não configurado", { status: 503 });
  }
  if (Number(req.headers.get("content-length") ?? 0) > LIMITE) return new Response("Grande demais", { status: 413 });
  const corpo = await req.text();
  if (corpo.length > LIMITE) return new Response("Grande demais", { status: 413 });
  if (!assinaturaValida(corpo, req.headers.get("x-hub-signature-256"), segredo)) {
    await registrarLog("aviso", "whatsapp", "Webhook com assinatura inválida rejeitado.");
    return new Response("Assinatura inválida", { status: 401 });
  }
  try {
    const r = await receberEventos(JSON.parse(corpo));
    return Response.json(r);
  } catch (e) {
    // 500 faz a Meta reenviar; a deduplicação garante que nada é processado duas vezes.
    log.erro("falha ao receber webhook", { erro: mensagemErro(e) });
    return new Response("Erro", { status: 500 });
  }
}
