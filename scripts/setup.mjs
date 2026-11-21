// npm run setup: prepara o projeto na primeira vez. Pode rodar de novo sem problema.
// Cria o .env com segredos fortes do PRÓPRIO app (nunca credenciais de terceiros), o banco e o conteúdo inicial.

import { execSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

const passo = (t) => console.log(`\n▶ ${t}`);
const rodar = (cmd) => execSync(cmd, { stdio: "inherit", env: { ...process.env, PRISMA_HIDE_UPDATE_MESSAGE: "1" } });

const [versao] = process.versions.node.split(".").map(Number);
if (versao < 22) {
  console.error(`✗ Node ${process.versions.node}. O projeto precisa do Node 22 ou mais novo: https://nodejs.org`);
  process.exit(1);
}

passo("Arquivo de configuração (.env)");
if (!existsSync(".env")) {
  copyFileSync(".env.example", ".env");
  console.log("  Criado a partir do .env.example.");
}
let env = readFileSync(".env", "utf8");
const gerados = [];
for (const nome of ["AUTH_SECRET", "APP_ENCRYPTION_KEY", "WHATSAPP_VERIFY_TOKEN"]) {
  const re = new RegExp(`^${nome}=(.*)$`, "m");
  const atual = env.match(re)?.[1]?.replace(/^"|"$/g, "") ?? "";
  if (atual.length >= 32 || (nome === "WHATSAPP_VERIFY_TOKEN" && atual.length >= 16)) continue;
  const valor = randomBytes(32).toString("base64url");
  env = re.test(env) ? env.replace(re, `${nome}="${valor}"`) : `${env.trimEnd()}\n${nome}="${valor}"\n`;
  gerados.push(nome);
}
writeFileSync(".env", env);
console.log(gerados.length ? `  Gerados: ${gerados.join(", ")}` : "  Segredos do app já existiam. Mantidos.");
console.log("  ⚠ Não troque APP_ENCRYPTION_KEY depois de cadastrar credenciais no painel (elas ficam ilegíveis).");

passo("Banco de dados");
if (!existsSync("data")) mkdirSync("data");
rodar("npx prisma db push");
rodar("npx prisma generate");

passo("Conteúdo inicial");
rodar("npx tsx scripts/seed.ts");

console.log("\n✓ Pronto!");
console.log('  1. Crie seu usuário:  npm run usuario -- --email voce@exemplo.com --nome "Seu Nome" --admin');
console.log("  2. Abra o sistema:    npm run iniciar\n");
