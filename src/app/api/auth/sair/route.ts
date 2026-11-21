import { cookies } from "next/headers";
import { auditar } from "@/lib/auditoria";
import { COOKIE_SESSAO, encerrarSessao } from "@/lib/auth";
import { rota } from "@/lib/http";

export const POST = rota(async (_req, { usuario }) => {
  const c = await cookies();
  await encerrarSessao(c.get(COOKIE_SESSAO)?.value);
  c.delete(COOKIE_SESSAO);
  await auditar(usuario.id, "logout");
  return Response.json({ ok: true });
});
