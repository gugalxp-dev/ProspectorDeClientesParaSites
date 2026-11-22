// Aceite eletrônico do contrato pelo cliente (rota pública: o token do link é a autorização).

import { z } from "zod";
import { aceitar, ErroContrato } from "@/core/contratos";
import { ipDe, jsonErro, lerJson, rota } from "@/lib/http";
import { dentroDoLimite } from "@/lib/limite";

type P = { token: string };

const esquema = z.object({
  nome: z.string().trim().min(5, "Informe o nome completo.").max(200),
  documento: z
    .string()
    .trim()
    .refine((d) => [11, 14].includes(d.replace(/\D/g, "").length), "Informe um CPF (11 dígitos) ou CNPJ (14 dígitos)."),
  concordo: z.literal(true, { message: "Marque que leu e concorda." }),
});

export const POST = rota<P>(
  async (req, { params }) => {
    const ip = ipDe(req);
    if (!(await dentroDoLimite(`aceite:${ip}`, 10, 3600_000))) return jsonErro(429, "Muitas tentativas. Tente de novo mais tarde.");
    const d = await lerJson(req, esquema);
    try {
      await aceitar(params.token, { nome: d.nome, documento: d.documento, ip, navegador: req.headers.get("user-agent") ?? "" });
      return Response.json({ ok: true });
    } catch (e) {
      if (e instanceof ErroContrato) return jsonErro(404, e.message);
      throw e;
    }
  },
  { publica: true },
);
