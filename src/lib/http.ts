// Base de todas as rotas da API: autenticação, papel, CSRF (origem), limite de corpo e validação com Zod.
// Ver "04 - Segurança/Segurança de APIs".

import { cookies } from "next/headers";
import { z, ZodError } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/core/db";
import { COOKIE_SESSAO, usuarioDoToken, type UsuarioSessao } from "./auth";
import { log, mensagemErro } from "./log";

export class ErroHttp extends Error {
  constructor(
    public status: number,
    mensagem: string,
  ) {
    super(mensagem);
  }
}

export function jsonErro(status: number, erro: string, extra?: Record<string, unknown>): Response {
  return Response.json({ erro, ...extra }, { status });
}

/** Rejeita chamadas de outra origem (CSRF). Sem Origin = chamada fora do navegador. */
export function mesmaOrigem(req: Request): boolean {
  const origem = req.headers.get("origin");
  if (!origem) return true;
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  try {
    return new URL(origem).host === host;
  } catch {
    return false;
  }
}

const LIMITE_CORPO = 512 * 1024;

export async function lerJson<T extends z.ZodType>(req: Request, esquema: T): Promise<z.infer<T>> {
  const tamanho = Number(req.headers.get("content-length") ?? 0);
  if (tamanho > LIMITE_CORPO) throw new ErroHttp(413, "Corpo da requisição grande demais.");
  const texto = await req.text();
  if (texto.length > LIMITE_CORPO) throw new ErroHttp(413, "Corpo da requisição grande demais.");
  let bruto: unknown;
  try {
    bruto = texto ? JSON.parse(texto) : {};
  } catch {
    throw new ErroHttp(400, "JSON inválido.");
  }
  return esquema.parse(bruto);
}

export function lerQuery<T extends z.ZodType>(req: Request, esquema: T): z.infer<T> {
  return esquema.parse(Object.fromEntries(new URL(req.url).searchParams));
}

interface OpcoesRota {
  papel?: "admin";
  /** Rotas públicas (login, webhook) cuidam da própria proteção. */
  publica?: boolean;
}

type Ctx<P> = { params: Promise<P> };
type Manipulador<P> = (req: Request, ctx: { usuario: UsuarioSessao; params: P }) => Promise<Response>;

const METODOS_SEGUROS = new Set(["GET", "HEAD", "OPTIONS"]);

/** Envolve um handler: 401 sem sessão, 404 para quem não é admin em rota admin, 403 para outra origem. */
export function rota<P = Record<string, never>>(fn: Manipulador<P>, opcoes: OpcoesRota = {}) {
  return async (req: Request, ctx: Ctx<P>): Promise<Response> => {
    try {
      if (!METODOS_SEGUROS.has(req.method) && !mesmaOrigem(req)) return jsonErro(403, "Origem não permitida.");
      let usuario: UsuarioSessao | null = null;
      if (!opcoes.publica) {
        usuario = await usuarioDoToken((await cookies()).get(COOKIE_SESSAO)?.value);
        if (!usuario) return jsonErro(401, "Sessão expirada. Entre de novo.");
        if (opcoes.papel === "admin" && usuario.papel !== "admin") return jsonErro(404, "Não encontrado.");
      }
      const params = ((await ctx?.params) ?? {}) as P;
      const res = await fn(req, { usuario: usuario as UsuarioSessao, params });
      res.headers.set("Cache-Control", "no-store");
      return res;
    } catch (e) {
      return respostaDeErro(e);
    }
  };
}

export function respostaDeErro(e: unknown): Response {
  if (e instanceof ErroHttp) return jsonErro(e.status, e.message);
  if (e instanceof ZodError) {
    return jsonErro(400, "Dados inválidos.", {
      campos: e.issues.map((i) => ({ campo: i.path.join("."), mensagem: i.message })),
    });
  }
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025") return jsonErro(404, "Não encontrado.");
  log.erro("erro na rota", { erro: mensagemErro(e) });
  return jsonErro(500, "Erro interno. Veja os logs do servidor.");
}

export function ipDe(req: Request): string {
  return (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || req.headers.get("x-real-ip") || "local";
}

/**
 * Idempotência: a mesma Idempotency-Key devolve a mesma resposta (duplo clique, rede instável).
 * A garantia vem da chave primária do banco (P2002), não de um "verifica e depois grava".
 */
export async function comIdempotencia(req: Request, escopo: string, fn: () => Promise<Response>): Promise<Response> {
  const bruta = req.headers.get("idempotency-key");
  if (!bruta || !/^[A-Za-z0-9_\-]{8,100}$/.test(bruta)) return fn();
  const chave = `${escopo}:${bruta}`;
  try {
    await db.chaveIdempotencia.create({ data: { chave } });
  } catch (e) {
    if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")) throw e;
    const visto = await db.chaveIdempotencia.findUnique({ where: { chave } });
    if (visto && visto.status > 0) {
      return new Response(visto.corpo, { status: visto.status, headers: { "content-type": "application/json", "idempotent-replay": "true" } });
    }
    return jsonErro(409, "Requisição repetida ainda em andamento.");
  }
  const res = await fn();
  const corpo = await res.clone().text();
  await db.chaveIdempotencia.update({ where: { chave }, data: { status: res.status, corpo } });
  return res;
}
