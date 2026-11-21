import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "../generated/prisma/client";

// Uma instância por processo (web e worker têm a sua), mesmo com o hot reload do Next.
const global = globalThis as unknown as { prisma?: PrismaClient; pragmas?: Promise<void> };

function criar(): PrismaClient {
  const adapter = new PrismaBetterSqlite3({ url: process.env.DATABASE_URL ?? "file:./data/app.db", timeout: 10_000 });
  return new PrismaClient({ adapter });
}

export const db = global.prisma ?? criar();
global.prisma = db;

/** WAL: o painel lê enquanto o worker grava. Chamado na subida do worker e do servidor. */
export function prepararBanco(): Promise<void> {
  global.pragmas ??= (async () => {
    await db.$queryRawUnsafe("PRAGMA journal_mode = WAL");
    await db.$queryRawUnsafe("PRAGMA synchronous = NORMAL");
  })();
  return global.pragmas;
}
