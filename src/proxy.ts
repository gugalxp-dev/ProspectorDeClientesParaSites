// Roda antes das páginas: CSP com nonce por requisição e redirecionamento para o login sem cookie de sessão.
// A validação de verdade da sessão acontece em cada página e rota (exigirUsuario / rota()).

import { NextResponse, type NextRequest } from "next/server";

const PUBLICAS = ["/entrar"];

export function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  // /contrato/<token>: página que o cliente abre pelo link (o token é a autorização).
  // /icon.svg e /apple-icon: ícone do site (aparece na aba e antes do login).
  const publica = PUBLICAS.includes(pathname) || pathname.startsWith("/contrato/") || pathname === "/icon.svg" || pathname.startsWith("/apple-icon");
  if (!publica && !req.cookies.has("pcs_sessao")) {
    const url = req.nextUrl.clone();
    url.pathname = "/entrar";
    url.search = pathname === "/" ? "" : `?voltar=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
  }

  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const dev = process.env.NODE_ENV === "development";
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    // Só quando o acesso vem pelo endereço HTTPS público (APP_URL). Abrindo por http://localhost, quebraria o painel.
    ...(acessoPeloEnderecoPublico(req) ? ["upgrade-insecure-requests"] : []),
  ].join("; ");

  const headers = new Headers(req.headers);
  headers.set("x-nonce", nonce);
  headers.set("Content-Security-Policy", csp);
  const res = NextResponse.next({ request: { headers } });
  res.headers.set("Content-Security-Policy", csp);
  return res;
}

export const config = {
  matcher: [
    {
      source: "/((?!api|_next/static|_next/image|favicon.ico).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};

/** A requisição chegou pelo endereço público HTTPS configurado em APP_URL (túnel/servidor), e não por localhost. */
function acessoPeloEnderecoPublico(req: NextRequest): boolean {
  const publico = process.env.APP_URL;
  if (!publico?.startsWith("https://")) return false;
  try {
    const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "";
    return new URL(publico).host === host;
  } catch {
    return false;
  }
}
