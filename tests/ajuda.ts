// Utilitários dos testes de integração.

import { db } from "../src/core/db";
import { reservar } from "../src/core/fila";
import { executarJob } from "../src/worker/executar";
import { MANIPULADORES } from "../src/worker/tarefas";

const TABELAS = [
  "mensagem", "conversa", "consentimento", "interacaoLead", "dadoOrigem", "leadOrigem", "buscaLead", "lead", "busca",
  "job", "evento", "logOperacao", "webhookEvento", "notificacao", "registroCusto", "conhecimento", "servico",
  "supressao", "config", "segredo", "auditoria", "limiteTaxa", "chaveIdempotencia", "sessao", "usuario",
] as const;

export async function limparBanco() {
  for (const t of TABELAS) {
    await (db[t] as unknown as { deleteMany: () => Promise<unknown> }).deleteMany();
  }
}

/** Roda a fila até esvaziar (como o worker faria), sem esperar os atrasos de retentativa. */
export async function rodarFila(maxCiclos = 200, opcoes: { ignorarAtraso?: boolean } = {}) {
  for (let i = 0; i < maxCiclos; i++) {
    if (opcoes.ignorarAtraso) await db.job.updateMany({ where: { status: "pendente" }, data: { executarApos: new Date(0) } });
    const jobs = await reservar(Object.keys(MANIPULADORES), 10);
    if (!jobs.length) return;
    await Promise.all(jobs.map(executarJob));
  }
}

export function respostaHtml(html: string, status = 200, url?: string): Response {
  const r = new Response(html, { status, headers: { "content-type": "text/html; charset=utf-8" } });
  if (url) Object.defineProperty(r, "url", { value: url });
  return r;
}

/** fetch falso: mapa URL -> HTML. robots.txt ausente = 404. */
export function fetchFalso(paginas: Record<string, string | { status: number; html?: string }>, visitas: string[] = []): typeof fetch {
  return (async (entrada: RequestInfo | URL) => {
    const url = typeof entrada === "string" ? entrada : entrada.toString();
    visitas.push(url);
    const p = paginas[url] ?? paginas[url.replace(/\/$/, "")];
    if (p === undefined) {
      if (url.endsWith("/robots.txt")) return new Response("", { status: 404 });
      return respostaHtml("<html>404</html>", 404, url);
    }
    if (typeof p === "string") {
      if (url.endsWith("/robots.txt")) return new Response(p, { status: 200, headers: { "content-type": "text/plain" } });
      return respostaHtml(p, 200, url);
    }
    return respostaHtml(p.html ?? "", p.status, url);
  }) as typeof fetch;
}
