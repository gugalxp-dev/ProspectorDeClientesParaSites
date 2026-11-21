// Cria (ou redefine a senha de) um usuário pelo terminal.
//   npm run usuario -- --email voce@exemplo.com --nome "Seu Nome" --admin
// A senha é gerada aleatoriamente e mostrada UMA vez. Troque depois em Admin > Usuários se quiser.

import "dotenv/config";
import { db } from "../src/core/db";
import { hashSenha, randomToken } from "../src/lib/crypto";

function arg(nome: string): string | undefined {
  const i = process.argv.indexOf(`--${nome}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const email = arg("email")?.trim().toLowerCase();
  const nome = arg("nome")?.trim() || email?.split("@")[0];
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    console.error('Uso: npm run usuario -- --email voce@exemplo.com --nome "Seu Nome" [--admin]');
    process.exit(1);
  }
  const papel = process.argv.includes("--admin") ? "admin" : "operador";
  const senha = randomToken(15);
  const senhaHash = await hashSenha(senha);
  const existente = await db.usuario.findUnique({ where: { email } });
  if (existente) {
    await db.usuario.update({ where: { email }, data: { senhaHash, bloqueadoEm: null, ...(process.argv.includes("--admin") ? { papel } : {}) } });
    await db.sessao.deleteMany({ where: { usuarioId: existente.id } });
    console.log(`✓ Senha redefinida para ${email}.`);
  } else {
    await db.usuario.create({ data: { email, nome: nome!, papel, senhaHash } });
    console.log(`✓ Usuário ${papel} criado: ${email}`);
  }
  console.log(`  Senha: ${senha}`);
  console.log("  Guarde agora: ela não será mostrada de novo.");
}

main().finally(() => db.$disconnect());
