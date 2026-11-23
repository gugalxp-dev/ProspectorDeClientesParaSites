
import { execSync, spawn } from "node:child_process";
import { existsSync } from "node:fs";

const PORTA = process.env.PORT || "3000";
const producao = process.argv.includes("--producao");
const ambienteRender = process.env.RENDER === "true";

const HOST = ambienteRender ? "0.0.0.0" : "127.0.0.1";
const URL_PAINEL = `http://${ambienteRender ? "127.0.0.1" : HOST}:${PORTA}`;

// Verificação necessária apenas no ambiente local.
if (!ambienteRender && (!existsSync(".env") || !existsSync("data/app.db"))) {
  console.error("✗ O projeto ainda não foi preparado. Rode primeiro: npm run setup");
  process.exit(1);
}

// Cria/verifica administrador.
console.log("Criando/verificando administrador...");
execSync("npx tsx scripts/criar-admin.ts", { stdio: "inherit" });

const processos = [
  spawn("npx", ["next", producao ? "start" : "dev", "--hostname", HOST, "--port", PORTA], {
    stdio: "inherit",
    shell: true,
  }),
  spawn("npx", ["tsx", "src/worker/index.ts"], {
    stdio: "inherit",
    shell: true,
  }),
];

let saindo = false;

function encerrar(codigo = 0) {
  if (saindo) return;
  saindo = true;

  for (const p of processos) {
    if (p && !p.killed) p.kill("SIGTERM");
  }

  setTimeout(() => process.exit(codigo), 3000);
}

for (const p of processos) {
  p.on("error", (erro) => {
    console.error("Erro ao iniciar processo:", erro);
    encerrar(1);
  });

  p.on("exit", (codigo) => {
    if (!saindo) encerrar(codigo ?? 0);
  });
}

process.on("SIGINT", () => encerrar(0));
process.on("SIGTERM", () => encerrar(0));

// Abre o navegador somente no ambiente local.
if (!ambienteRender) {
  const abrir = {
    win32: `start "" ${URL_PAINEL}`,
    darwin: `open ${URL_PAINEL}`,
  }[process.platform] ?? `xdg-open ${URL_PAINEL}`;

  for (let i = 0; i < 90; i++) {
    await new Promise((r) => setTimeout(r, 1000));

    try {
      await fetch(`${URL_PAINEL}/entrar`, {
        signal: AbortSignal.timeout(2000),
      });

      console.log(`\n✓ Painel em ${URL_PAINEL} · worker rodando · Ctrl + C para sair\n`);

      try {
        execSync(abrir, { stdio: "ignore" });
      } catch {
        // Sem navegador padrão.
      }

      break;
    } catch {
      // Ainda subindo.
    }
  }
}
