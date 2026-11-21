// npm run iniciar: sobe o painel (Next.js) e o worker (fila de tarefas) juntos. Ctrl + C encerra os dois.
// Use "npm run iniciar -- --producao" depois de "npm run build" para rodar a versão otimizada.

import { execSync, spawn } from "node:child_process";
import { existsSync } from "node:fs";

const PORTA = process.env.PORT || "3000";
const URL_PAINEL = `http://localhost:${PORTA}`;
const producao = process.argv.includes("--producao");

if (!existsSync(".env") || !existsSync("data/app.db")) {
  console.error("✗ O projeto ainda não foi preparado. Rode primeiro:  npm run setup");
  process.exit(1);
}

const processos = [
  spawn("npx", ["next", producao ? "start" : "dev", "--hostname", "127.0.0.1", "--port", PORTA], { stdio: "inherit", shell: true }),
  spawn("npx", ["tsx", "src/worker/index.ts"], { stdio: "inherit", shell: true }),
];

let saindo = false;
function encerrar(codigo = 0) {
  if (saindo) return;
  saindo = true;
  for (const p of processos) p.kill("SIGTERM");
  setTimeout(() => process.exit(codigo), 3000);
}
for (const p of processos) p.on("exit", (c) => encerrar(c ?? 0));
process.on("SIGINT", () => encerrar(0));

const abrir = { win32: `start "" ${URL_PAINEL}`, darwin: `open ${URL_PAINEL}` }[process.platform] ?? `xdg-open ${URL_PAINEL}`;
for (let i = 0; i < 90; i++) {
  await new Promise((r) => setTimeout(r, 1000));
  try {
    await fetch(`${URL_PAINEL}/entrar`, { signal: AbortSignal.timeout(2000) });
    console.log(`\n✓ Painel em ${URL_PAINEL}  ·  worker rodando  ·  Ctrl + C para sair\n`);
    try {
      execSync(abrir, { stdio: "ignore" });
    } catch {
      // sem navegador padrão
    }
    break;
  } catch {
    // ainda subindo
  }
}
