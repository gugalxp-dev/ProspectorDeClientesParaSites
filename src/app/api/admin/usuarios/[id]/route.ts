import { z } from "zod";
import { db } from "@/core/db";
import { auditar } from "@/lib/auditoria";
import { hashSenha } from "@/lib/crypto";
import { jsonErro, lerJson, rota } from "@/lib/http";
import { esquemaSenha } from "@/lib/esquemas";

type P = { id: string };

const esquema = z.object({
  papel: z.enum(["admin", "operador"]).optional(),
  bloqueado: z.boolean().optional(),
  senha: esquemaSenha.optional(),
});

export const PATCH = rota<P>(
  async (req, { params, usuario }) => {
    const d = await lerJson(req, esquema);
    if (params.id === usuario.id && (d.bloqueado || d.papel === "operador")) return jsonErro(400, "Você não pode bloquear ou rebaixar a própria conta.");
    const u = await db.usuario.update({
      where: { id: params.id },
      data: {
        ...(d.papel ? { papel: d.papel } : {}),
        ...(d.bloqueado !== undefined ? { bloqueadoEm: d.bloqueado ? new Date() : null } : {}),
        ...(d.senha ? { senhaHash: await hashSenha(d.senha) } : {}),
      },
      omit: { senhaHash: true },
    });
    // Bloqueio ou troca de senha derrubam as sessões abertas.
    if (d.bloqueado || d.senha) await db.sessao.deleteMany({ where: { usuarioId: params.id } });
    await auditar(usuario.id, "usuario_alterado", params.id, { papel: d.papel, bloqueado: d.bloqueado, trocouSenha: !!d.senha });
    return Response.json(u);
  },
  { papel: "admin" },
);
