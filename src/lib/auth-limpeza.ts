// Limpeza de sessões vencidas, separada de auth.ts para o worker não importar next/headers.

import { db } from "@/core/db";

export async function limparSessoesExpiradas(): Promise<void> {
  await db.sessao.deleteMany({ where: { expiraEm: { lt: new Date() } } });
}
