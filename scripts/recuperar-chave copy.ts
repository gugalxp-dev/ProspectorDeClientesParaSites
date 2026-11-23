
import "dotenv/config";

import { db } from "../src/core/db";
import { decifrar } from "../src/lib/crypto";

async function main() {
  try {
    const registros = await db.$queryRawUnsafe<
      { chave: string; cifrado: string }[]
    >(
      'SELECT "chave", "cifrado" FROM "Segredo"'
    );

    const registro = registros.find((item) =>
      item.chave.toLowerCase().includes("openai")
    );

    if (!registro) {
      console.log("Credencial da OpenAI não encontrada.");
      console.log("Chaves cadastradas:", registros.map(r => r.chave));
      return;
    }

    const chaveOriginal = decifrar(registro.cifrado);

    console.log("\nChave original da OpenAI:");
    console.log(chaveOriginal);

  } catch (erro) {
    console.error("Erro ao recuperar credencial:", erro);
  } finally {
    await db.$disconnect();
  }
}

main();
