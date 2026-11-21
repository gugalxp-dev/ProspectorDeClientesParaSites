// Chamadas do navegador para a API. Mesma origem (cookie de sessão httpOnly vai sozinho).

export class ErroApi extends Error {
  constructor(
    mensagem: string,
    public status: number,
    public campos?: Array<{ campo: string; mensagem: string }>,
  ) {
    super(mensagem);
  }
}

export async function chamarApi<T = unknown>(
  url: string,
  opcoes: { metodo?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE"; corpo?: unknown; idempotente?: boolean } = {},
): Promise<T> {
  const headers: Record<string, string> = {};
  if (opcoes.corpo !== undefined) headers["Content-Type"] = "application/json";
  if (opcoes.idempotente) headers["Idempotency-Key"] = crypto.randomUUID().replace(/-/g, "");
  const r = await fetch(url, {
    method: opcoes.metodo ?? (opcoes.corpo !== undefined ? "POST" : "GET"),
    headers,
    body: opcoes.corpo !== undefined ? JSON.stringify(opcoes.corpo) : undefined,
    cache: "no-store",
  });
  if (r.status === 401 && typeof window !== "undefined") {
    window.location.href = `/entrar?voltar=${encodeURIComponent(window.location.pathname)}`;
  }
  const dados = (await r.json().catch(() => ({}))) as { erro?: string; campos?: Array<{ campo: string; mensagem: string }> };
  if (!r.ok) {
    const detalhe = dados.campos?.length ? `: ${dados.campos.map((c) => `${c.campo} ${c.mensagem}`).join("; ")}` : "";
    throw new ErroApi((dados.erro ?? `Erro ${r.status}`) + detalhe, r.status, dados.campos);
  }
  return dados as T;
}
