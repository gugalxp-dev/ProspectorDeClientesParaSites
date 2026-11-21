// Server-Sent Events. Cada evento tem id crescente (tabela Evento): ao reconectar, o navegador manda
// Last-Event-ID e recebe só o que perdeu. Eventos são gravados depois da persistência, então nunca
// anunciam algo que não está no banco.

import { cookies } from "next/headers";
import { eventosDesde, ultimoEventoId } from "@/core/eventos";
import { COOKIE_SESSAO, usuarioDoToken } from "@/lib/auth";
import { jsonErro } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const usuario = await usuarioDoToken((await cookies()).get(COOKIE_SESSAO)?.value);
  if (!usuario) return jsonErro(401, "Sessão expirada.");

  const cabecalho = Number(req.headers.get("last-event-id"));
  let ultimo = Number.isFinite(cabecalho) && cabecalho > 0 ? cabecalho : await ultimoEventoId();
  const codificador = new TextEncoder();
  let ativo = true;
  req.signal.addEventListener("abort", () => {
    ativo = false;
  });

  const stream = new ReadableStream({
    async start(controller) {
      const enviar = (texto: string) => {
        try {
          controller.enqueue(codificador.encode(texto));
        } catch {
          ativo = false;
        }
      };
      enviar(`retry: 3000\nevent: conectado\ndata: ${JSON.stringify({ ultimo })}\n\n`);
      let ultimoPing = Date.now();
      while (ativo) {
        try {
          const eventos = await eventosDesde(ultimo, 200);
          for (const e of eventos) {
            enviar(`id: ${e.id}\nevent: ${e.tipo}\ndata: ${e.payload}\n\n`);
            ultimo = e.id;
          }
          if (Date.now() - ultimoPing > 15_000) {
            enviar(`: ping\n\n`);
            ultimoPing = Date.now();
          }
        } catch {
          // banco ocupado: tenta no próximo ciclo
        }
        await new Promise((r) => setTimeout(r, 1000));
      }
      try {
        controller.close();
      } catch {
        // já fechado
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
