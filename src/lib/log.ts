// Log estruturado em JSON (uma linha por evento), sempre sem segredos.

const CHAVES_SECRETAS = /token|secret|senha|password|authorization|api[_-]?key|cookie/i;

/** Mascara segredos em texto livre (Bearer, chaves sk-..., token da Meta, parâmetros de token em URLs). */
export function mascararSegredos(s: string): string {
  return s
    .replace(/(Bearer\s+)[A-Za-z0-9._\-]+/gi, "$1••••")
    .replace(/\bsk-[A-Za-z0-9_\-]{8,}/g, "sk-••••")
    .replace(/\bEAA[A-Za-z0-9]{20,}/g, "EAA••••")
    .replace(/([?&](?:access_token|token|key|hub\.verify_token)=)[^&\s"']+/gi, "$1••••");
}

/** Remove valores de chaves sensíveis em objetos antes de logar ou auditar. */
export function limparObjeto(v: unknown, profundidade = 0): unknown {
  if (profundidade > 5) return "…";
  if (typeof v === "string") return mascararSegredos(v);
  if (Array.isArray(v)) return v.map((x) => limparObjeto(x, profundidade + 1));
  if (v && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v)) out[k] = CHAVES_SECRETAS.test(k) ? "••••" : limparObjeto(val, profundidade + 1);
    return out;
  }
  return v;
}

type Nivel = "debug" | "info" | "aviso" | "erro";

function escrever(nivel: Nivel, msg: string, dados?: Record<string, unknown>) {
  if (process.env.NODE_ENV === "test" && nivel !== "erro") return;
  const linha = JSON.stringify({ t: new Date().toISOString(), nivel, msg: mascararSegredos(msg), ...(limparObjeto(dados ?? {}) as object) });
  if (nivel === "erro") console.error(linha);
  else console.log(linha);
}

export const log = {
  debug: (m: string, d?: Record<string, unknown>) => {
    if (process.env.LOG_DEBUG) escrever("debug", m, d);
  },
  info: (m: string, d?: Record<string, unknown>) => escrever("info", m, d),
  aviso: (m: string, d?: Record<string, unknown>) => escrever("aviso", m, d),
  erro: (m: string, d?: Record<string, unknown>) => escrever("erro", m, d),
};

export function mensagemErro(e: unknown): string {
  return mascararSegredos(e instanceof Error ? e.message : String(e)).slice(0, 1000);
}
