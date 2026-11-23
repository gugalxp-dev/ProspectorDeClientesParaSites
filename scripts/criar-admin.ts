
import "dotenv/config";
import { db } from "../src/core/db";
import { hashSenha } from "@/lib/crypto";

async function main() {
  const email = "admin@admin.com";
  const nome = "Administrador";
  const senha = "admin123";

  const senhaHash = await hashSenha(senha);

  const usuario = await db.usuario.upsert({
    where: { email },
    update: {
      nome,
      senhaHash,
      papel: "admin",
      bloqueadoEm: null,
    },
    create: {
      nome,
      email,
      senhaHash,
      papel: "admin",
    },
  });

  console.log("Administrador criado:", usuario.email);
}

main()
  .catch(console.error)
  .finally(() => db.$disconnect());
