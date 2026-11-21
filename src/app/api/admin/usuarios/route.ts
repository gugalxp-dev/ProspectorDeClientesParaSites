import { z } from "zod";
import { esquemaSenha } from "@/lib/esquemas";
import { db } from "@/core/db";
import { auditar } from "@/lib/auditoria";
import { hashSenha } from "@/lib/crypto";
import { jsonErro, lerJson, rota } from "@/lib/http";

const SEM_SENHA = { senhaHash: true } as const;

export const GET = rota(async () => Response.json(await db.usuario.findMany({ omit: SEM_SENHA, orderBy: { criadoEm: "asc" } })), { papel: "admin" });

const esquema = z.object({
  email: z.string().trim().toLowerCase().email().max(200),
  nome: z.string().trim().min(2).max(100),
  papel: z.enum(["admin", "operador"]),
  senha: esquemaSenha,
});

export const POST = rota(
  async (req, { usuario }) => {
    const d = await lerJson(req, esquema);
    if (await db.usuario.findUnique({ where: { email: d.email } })) return jsonErro(409, "Já existe um usuário com este e-mail.");
    const u = await db.usuario.create({ data: { email: d.email, nome: d.nome, papel: d.papel, senhaHash: await hashSenha(d.senha) }, omit: SEM_SENHA });
    await auditar(usuario.id, "usuario_criado", u.id, { email: d.email, papel: d.papel });
    return Response.json(u, { status: 201 });
  },
  { papel: "admin" },
);
