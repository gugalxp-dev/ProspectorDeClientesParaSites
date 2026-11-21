// Fila de trabalhos persistida no banco (sem Redis): sobrevive a reinícios e funciona localmente.
// - Reserva atômica: só quem consegue mudar pendente -> rodando executa (updateMany com condição)
// - Idempotência: "chave" única impede o mesmo trabalho duas vezes
// - Retentativas com espera exponencial; trabalhos travados (worker caiu) voltam para a fila

import { Prisma } from "@/generated/prisma/client";
import { db } from "./db";

export interface OpcoesJob {
  chave?: string;
  buscaId?: string | null;
  maxTentativas?: number;
  atrasoMs?: number;
  /** Se já existe um job com a mesma chave e ele terminou, roda de novo. */
  reabrirSeConcluido?: boolean;
}

export async function enfileirar(tipo: string, payload: Record<string, unknown>, o: OpcoesJob = {}) {
  const dados = {
    tipo,
    payload: JSON.stringify(payload),
    chave: o.chave ?? null,
    buscaId: o.buscaId ?? null,
    maxTentativas: o.maxTentativas ?? 3,
    executarApos: new Date(Date.now() + (o.atrasoMs ?? 0)),
  };
  try {
    return await db.job.create({ data: dados });
  } catch (e) {
    if (!(o.chave && e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")) throw e;
    const existente = await db.job.findUnique({ where: { chave: o.chave } });
    if (existente && o.reabrirSeConcluido && ["ok", "falhou", "cancelado"].includes(existente.status)) {
      return db.job.update({
        where: { id: existente.id },
        data: { ...dados, status: "pendente", tentativas: 0, erro: null, travadoAte: null },
      });
    }
    return existente!;
  }
}

export type JobReservado = Awaited<ReturnType<typeof db.job.findFirstOrThrow>>;

const LEASE_MS = 10 * 60_000;

/** Reserva até `limite` trabalhos dos tipos pedidos. */
export async function reservar(tipos: string[], limite: number, leaseMs = LEASE_MS): Promise<JobReservado[]> {
  if (limite <= 0) return [];
  const candidatos = await db.job.findMany({
    where: { status: "pendente", tipo: { in: tipos }, executarApos: { lte: new Date() } },
    orderBy: [{ executarApos: "asc" }, { criadoEm: "asc" }],
    take: limite * 3,
    select: { id: true },
  });
  const reservados: JobReservado[] = [];
  for (const c of candidatos) {
    if (reservados.length >= limite) break;
    const r = await db.job.updateMany({
      where: { id: c.id, status: "pendente" },
      data: { status: "rodando", travadoAte: new Date(Date.now() + leaseMs), tentativas: { increment: 1 } },
    });
    if (r.count === 1) reservados.push(await db.job.findUniqueOrThrow({ where: { id: c.id } }));
  }
  return reservados;
}

export async function concluir(id: string): Promise<void> {
  await db.job.updateMany({ where: { id, status: "rodando" }, data: { status: "ok", travadoAte: null, erro: null } });
}

/** Erro que não adianta tentar de novo (dado inválido, limite de consumo...). */
export class ErroDefinitivo extends Error {}

export async function falhar(job: JobReservado, erro: string, definitivo = false): Promise<"retentar" | "falhou"> {
  if (definitivo || job.tentativas >= job.maxTentativas) {
    await db.job.updateMany({ where: { id: job.id, status: "rodando" }, data: { status: "falhou", erro, travadoAte: null } });
    return "falhou";
  }
  const espera = Math.min(15 * 60_000, 15_000 * 2 ** (job.tentativas - 1));
  await db.job.updateMany({
    where: { id: job.id, status: "rodando" },
    data: { status: "pendente", erro, travadoAte: null, executarApos: new Date(Date.now() + espera) },
  });
  return "retentar";
}

/** Worker caiu no meio: o lease venceu, o trabalho volta para a fila (ou falha se esgotou as tentativas). */
export async function recuperarTravados(): Promise<number> {
  const agora = new Date();
  const travados = await db.job.findMany({ where: { status: "rodando", travadoAte: { lt: agora } } });
  for (const j of travados) {
    const esgotou = j.tentativas >= j.maxTentativas;
    await db.job.updateMany({
      where: { id: j.id, status: "rodando" },
      data: esgotou
        ? { status: "falhou", erro: "O worker parou durante a execução e as tentativas acabaram.", travadoAte: null }
        : { status: "pendente", travadoAte: null, erro: "Retomado após o worker parar." },
    });
  }
  return travados.length;
}

export async function cancelarJobsDaBusca(buscaId: string): Promise<number> {
  const r = await db.job.updateMany({ where: { buscaId, status: "pendente" }, data: { status: "cancelado" } });
  return r.count;
}

export function lerPayload<T>(job: { payload: string }): T {
  return JSON.parse(job.payload) as T;
}
