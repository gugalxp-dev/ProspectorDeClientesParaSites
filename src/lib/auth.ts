// Autenticação por e-mail e senha com sessão opaca no banco. Ver "04 - Segurança/Autenticação".
// - senha: scrypt com sal; e-mail inexistente custa o mesmo tempo que senha errada e recebe a mesma mensagem
// - sessão: token aleatório de 32 bytes no cookie httpOnly; no banco só o HMAC do token
// - limite: 5 tentativas por e-mail e 20 por IP a cada 15 minutos

import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { db } from "@/core/db";
import type { Papel } from "@/core/tipos";
import { auditar } from "./auditoria";
import { conferirSenha, hashSecret, HASH_ISCA, randomToken } from "./crypto";
import { dentroDoLimite, zerarLimite } from "./limite";

export const COOKIE_SESSAO = "pcs_sessao";
const DURACAO_MS = 7 * 24 * 3600_000;
const JANELA_LOGIN_MS = 15 * 60_000;

export interface UsuarioSessao {
  id: string;
  email: string;
  nome: string;
  papel: Papel;
}

export type ResultadoLogin = { ok: true; token: string; expiraEm: Date } | { ok: false; erro: string; status: number };

const ERRO_GENERICO = "E-mail ou senha incorretos.";

export async function login(emailBruto: string, senha: string, ip: string): Promise<ResultadoLogin> {
  const email = emailBruto.trim().toLowerCase();
  const porEmail = await dentroDoLimite(`login:email:${email}`, 5, JANELA_LOGIN_MS);
  const porIp = await dentroDoLimite(`login:ip:${ip}`, 20, JANELA_LOGIN_MS);
  if (!porEmail || !porIp) {
    return { ok: false, status: 429, erro: "Muitas tentativas. Aguarde 15 minutos e tente de novo." };
  }

  const u = await db.usuario.findUnique({ where: { email } });
  // Confere mesmo sem usuário, contra um hash isca: o tempo de resposta não revela se o e-mail existe.
  const senhaOk = await conferirSenha(senha, u?.senhaHash ?? HASH_ISCA);
  if (!u || !senhaOk || u.bloqueadoEm) {
    await auditar(u?.id ?? null, "login_falhou", email, { ip });
    return { ok: false, status: 401, erro: ERRO_GENERICO };
  }

  await zerarLimite(`login:email:${email}`);
  const token = randomToken();
  const expiraEm = new Date(Date.now() + DURACAO_MS);
  await db.sessao.create({ data: { tokenHash: hashSecret(token), usuarioId: u.id, expiraEm } });
  await db.usuario.update({ where: { id: u.id }, data: { ultimoAcesso: new Date() } });
  await auditar(u.id, "login", email, { ip });
  return { ok: true, token, expiraEm };
}

export function opcoesCookie(expiraEm: Date) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiraEm,
  };
}

export async function usuarioDoToken(token: string | undefined): Promise<UsuarioSessao | null> {
  if (!token || token.length > 200) return null;
  const s = await db.sessao.findUnique({ where: { tokenHash: hashSecret(token) }, include: { usuario: true } });
  if (!s || s.expiraEm < new Date() || s.usuario.bloqueadoEm) return null;
  return { id: s.usuario.id, email: s.usuario.email, nome: s.usuario.nome, papel: s.usuario.papel as Papel };
}

export async function usuarioAtual(): Promise<UsuarioSessao | null> {
  const c = await cookies();
  return usuarioDoToken(c.get(COOKIE_SESSAO)?.value);
}

export async function encerrarSessao(token: string | undefined): Promise<void> {
  if (!token) return;
  await db.sessao.deleteMany({ where: { tokenHash: hashSecret(token) } });
}

/** Páginas: cada página confere sozinha (a navegação do cliente não roda o layout de novo). */
export async function exigirUsuario(caminho = "/"): Promise<UsuarioSessao> {
  const u = await usuarioAtual();
  if (!u) redirect(`/entrar?voltar=${encodeURIComponent(caminho)}`);
  return u;
}

/** Área administrativa: quem não é admin recebe 404, não 403 (não confirma que a área existe). */
export async function exigirAdmin(caminho = "/admin"): Promise<UsuarioSessao> {
  const u = await exigirUsuario(caminho);
  if (u.papel !== "admin") notFound();
  return u;
}
