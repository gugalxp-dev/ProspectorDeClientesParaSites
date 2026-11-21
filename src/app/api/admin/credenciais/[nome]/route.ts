// Cadastro de credenciais pelo painel. Recebe o valor uma vez, guarda cifrado e nunca devolve.

import { z } from "zod";
import { ehCredencial, estadoCredenciais, removerCredencial, salvarCredencial } from "@/core/segredos";
import { auditar } from "@/lib/auditoria";
import { jsonErro, lerJson, rota } from "@/lib/http";

type P = { nome: string };
const esquema = z.object({ valor: z.string().trim().min(4).max(4000) });

export const PUT = rota<P>(
  async (req, { params, usuario }) => {
    if (!ehCredencial(params.nome)) return jsonErro(404, "Credencial desconhecida.");
    const { valor } = await lerJson(req, esquema);
    await salvarCredencial(params.nome, valor, usuario.id);
    await auditar(usuario.id, "credencial_salva", params.nome);
    return Response.json((await estadoCredenciais()).find((c) => c.nome === params.nome));
  },
  { papel: "admin" },
);

export const DELETE = rota<P>(
  async (_req, { params, usuario }) => {
    if (!ehCredencial(params.nome)) return jsonErro(404, "Credencial desconhecida.");
    await removerCredencial(params.nome);
    await auditar(usuario.id, "credencial_removida", params.nome);
    return Response.json({ ok: true });
  },
  { papel: "admin" },
);
