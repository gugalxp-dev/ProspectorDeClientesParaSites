// Esquemas Zod compartilhados entre rotas (arquivos de rota do Next só podem exportar handlers).

import { z } from "zod";

export const esquemaConhecimento = z.object({
  categoria: z.string().trim().min(2).max(60),
  titulo: z.string().trim().min(2).max(150),
  conteudo: z.string().trim().min(10).max(8000),
  tags: z.string().trim().max(300).optional().nullable(),
  ativo: z.boolean().default(true),
});

export const esquemaServico = z.object({
  nome: z.string().trim().min(2).max(120),
  descricao: z.string().trim().min(5).max(2000),
  precoCentavos: z.number().int().min(0).max(100_000_000),
  prazoDias: z.number().int().min(1).max(365),
  condicoes: z.string().trim().max(2000).optional().nullable(),
  descontoMaxPct: z.number().int().min(0).max(100),
  ativo: z.boolean().default(true),
  ordem: z.number().int().min(0).max(1000).default(0),
});

export const esquemaSenha = z
  .string()
  .min(12, "A senha precisa ter pelo menos 12 caracteres.")
  .max(200)
  .refine((s) => /[a-zA-Z]/.test(s) && /\d/.test(s), "Use letras e números.");
