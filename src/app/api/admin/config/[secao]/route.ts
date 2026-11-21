import { obterConfig, salvarConfig, SECOES, type Secao } from "@/core/config";
import { auditar } from "@/lib/auditoria";
import { jsonErro, lerJson, rota } from "@/lib/http";
import { z } from "zod";

type P = { secao: string };
const ehSecao = (s: string): s is Secao => s in SECOES;

export const GET = rota<P>(
  async (_req, { params }) => (ehSecao(params.secao) ? Response.json(await obterConfig(params.secao)) : jsonErro(404, "Seção desconhecida.")),
  { papel: "admin" },
);

export const PUT = rota<P>(
  async (req, { params, usuario }) => {
    if (!ehSecao(params.secao)) return jsonErro(404, "Seção desconhecida.");
    const dados = await lerJson(req, z.record(z.string(), z.unknown()));
    const atual = await obterConfig(params.secao);
    const salvo = await salvarConfig(params.secao, { ...atual, ...dados });
    await auditar(usuario.id, "config_alterada", params.secao, dados);
    return Response.json(salvo);
  },
  { papel: "admin" },
);
