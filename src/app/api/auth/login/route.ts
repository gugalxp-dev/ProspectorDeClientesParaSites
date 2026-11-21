import { cookies } from "next/headers";
import { z } from "zod";
import { COOKIE_SESSAO, login, opcoesCookie } from "@/lib/auth";
import { ipDe, jsonErro, lerJson, rota } from "@/lib/http";

const esquema = z.object({
  email: z.string().trim().email().max(200),
  senha: z.string().min(1).max(200),
});

export const POST = rota(
  async (req) => {
    const { email, senha } = await lerJson(req, esquema);
    const r = await login(email, senha, ipDe(req));
    if (!r.ok) return jsonErro(r.status, r.erro);
    (await cookies()).set(COOKIE_SESSAO, r.token, opcoesCookie(r.expiraEm));
    return Response.json({ ok: true });
  },
  { publica: true },
);
