// Estado da conexão Baileys (QR code) e desconexão do número. A conexão em si vive no worker.

import { auditar } from "@/lib/auditoria";
import { desconectarBaileys, estadoBaileys, modoWhatsApp } from "@/core/whatsapp/cliente";
import { jsonErro, rota } from "@/lib/http";
import { mensagemErro } from "@/lib/log";

export const GET = rota(
  async () => {
    if ((await modoWhatsApp()) !== "baileys") return jsonErro(404, "Modo Baileys desativado.");
    try {
      return Response.json(await estadoBaileys());
    } catch (e) {
      return Response.json({ conectado: false, qr: null, numero: null, detalhe: mensagemErro(e) });
    }
  },
  { papel: "admin" },
);

export const POST = rota(
  async (_req, { usuario }) => {
    if ((await modoWhatsApp()) !== "baileys") return jsonErro(404, "Modo Baileys desativado.");
    await desconectarBaileys();
    await auditar(usuario.id, "whatsapp_baileys_desconectado", "baileys");
    return Response.json({ ok: true });
  },
  { papel: "admin" },
);
