// Execução de um trabalho reservado: chama o manipulador, conclui ou agenda retentativa,
// e atualiza o progresso da pesquisa DEPOIS de o trabalho sair de "rodando".

import { atualizarProgresso } from "@/core/busca";
import { registrarLog } from "@/core/eventos";
import { concluir, ErroDefinitivo, falhar, lerPayload, type JobReservado } from "@/core/fila";
import { FonteIndisponivel } from "@/core/fontes/tipos";
import { log, mensagemErro } from "@/lib/log";
import { MANIPULADORES } from "./tarefas";

export async function executarJob(job: JobReservado): Promise<void> {
  const fn = MANIPULADORES[job.tipo];
  const inicio = Date.now();
  try {
    if (!fn) {
      await falhar(job, `Tipo de trabalho desconhecido: ${job.tipo}`, true);
      return;
    }
    try {
      await fn(lerPayload(job));
      await concluir(job.id);
      log.info("job ok", { tipo: job.tipo, id: job.id, ms: Date.now() - inicio });
    } catch (e) {
      const resultado = await falhar(job, mensagemErro(e), e instanceof ErroDefinitivo);
      if (resultado === "falhou") {
        await registrarLog("erro", job.tipo, `Falhou após ${job.tentativas} tentativa(s): ${mensagemErro(e)}`, { buscaId: job.buscaId });
      } else {
        log[e instanceof FonteIndisponivel ? "info" : "aviso"]("job vai tentar de novo", { tipo: job.tipo, id: job.id, tentativa: job.tentativas, erro: mensagemErro(e) });
      }
    }
  } finally {
    if (job.buscaId) await atualizarProgresso(job.buscaId).catch((e) => log.erro("falha ao atualizar progresso", { erro: mensagemErro(e) }));
  }
}
