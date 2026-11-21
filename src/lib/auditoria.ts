// Trilha de auditoria das ações sensíveis (credenciais, consentimento, transferência, exclusão de dados...).

import { db } from "@/core/db";
import { limparObjeto } from "./log";

export async function auditar(usuarioId: string | null, acao: string, alvo?: string | null, detalhe?: unknown): Promise<void> {
  await db.auditoria.create({
    data: {
      usuarioId,
      acao,
      alvo: alvo ?? null,
      detalhe: detalhe === undefined ? null : JSON.stringify(limparObjeto(detalhe)),
    },
  });
}
