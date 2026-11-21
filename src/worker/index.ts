// Worker: processo separado do servidor web que executa a fila (npm run worker).
// Concorrência por tipo de trabalho, retentativas controladas, recuperação de trabalhos travados
// e encerramento gracioso (termina o que está rodando antes de sair).

import "dotenv/config";
import { obterConfig } from "@/core/config";
import { garantirEtapas } from "@/core/crm/etapas";
import { prepararBanco } from "@/core/db";
import { enfileirar, recuperarTravados, reservar } from "@/core/fila";
import { log, mensagemErro } from "@/lib/log";
import { executarJob } from "./executar";

interface Grupo {
  tipos: string[];
  limite: () => Promise<number>;
  rodando: number;
}

const GRUPOS: Grupo[] = [
  // Mensagens primeiro: o cliente está esperando.
  { tipos: ["whatsapp_evento", "whatsapp_mock_status"], limite: async () => 4, rodando: 0 },
  { tipos: ["agente_responder"], limite: async () => 2, rodando: 0 },
  { tipos: ["busca_descobrir"], limite: async () => (await obterConfig("prospeccao")).buscasSimultaneas, rodando: 0 },
  { tipos: ["lead_processar"], limite: async () => (await obterConfig("prospeccao")).crawler.concorrencia, rodando: 0 },
  { tipos: ["lead_qualificar"], limite: async () => 2, rodando: 0 },
  { tipos: ["manutencao_diaria"], limite: async () => 1, rodando: 0 },
];

let parando = false;
const emExecucao = new Set<Promise<void>>();

async function ciclo(): Promise<number> {
  let iniciados = 0;
  for (const g of GRUPOS) {
    const livres = (await g.limite()) - g.rodando;
    if (livres <= 0) continue;
    const jobs = await reservar(g.tipos, livres);
    for (const job of jobs) {
      g.rodando++;
      iniciados++;
      const p = executarJob(job).finally(() => {
        g.rodando--;
        emExecucao.delete(p);
      });
      emExecucao.add(p);
    }
  }
  return iniciados;
}

async function agendarManutencao() {
  const hoje = new Date().toISOString().slice(0, 10);
  await enfileirar("manutencao_diaria", {}, { chave: `manutencao:${hoje}`, maxTentativas: 2 });
}

async function principal() {
  await prepararBanco();
  await garantirEtapas();
  log.info("worker iniciado");
  let ultimaRecuperacao = 0;
  while (!parando) {
    try {
      if (Date.now() - ultimaRecuperacao > 30_000) {
        const n = await recuperarTravados();
        if (n) log.aviso("trabalhos travados devolvidos à fila", { quantidade: n });
        await agendarManutencao();
        ultimaRecuperacao = Date.now();
      }
      const n = await ciclo();
      await new Promise((r) => setTimeout(r, n ? 200 : 1000));
    } catch (e) {
      log.erro("erro no ciclo do worker", { erro: mensagemErro(e) });
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
  log.info("worker parando: aguardando trabalhos em andamento", { quantidade: emExecucao.size });
  await Promise.allSettled([...emExecucao]);
  process.exit(0);
}

for (const sinal of ["SIGINT", "SIGTERM"] as const) {
  process.on(sinal, () => {
    parando = true;
  });
}

void principal();
