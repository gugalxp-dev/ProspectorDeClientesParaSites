import Link from "next/link";
import { AtualizarAoVivo } from "@/components/AoVivo";
import { NovaPesquisa } from "@/components/NovaPesquisa";
import { CancelarPesquisa } from "@/components/CancelarPesquisa";
import { ExcluirPesquisa } from "@/components/ExcluirPesquisa";
import { RefazerPesquisa } from "@/components/RefazerPesquisa";
import { Barra, Titulo, Vazio, dataHora, usd } from "@/components/ui";
import { listarBuscas } from "@/core/busca";
import { obterConfig } from "@/core/config";
import { todasAsFontes } from "@/core/fontes";
import { STATUS_BUSCA_ROTULO } from "@/core/tipos";
import { exigirUsuario } from "@/lib/auth";

const COR_STATUS: Record<string, string> = {
  pendente: "bg-slate-100 text-slate-700",
  descobrindo: "bg-sky-100 text-sky-800",
  processando: "bg-indigo-100 text-indigo-800",
  concluida: "bg-emerald-100 text-emerald-800",
  falhou: "bg-rose-100 text-rose-800",
  cancelada: "bg-zinc-100 text-zinc-600",
};

export default async function Pesquisas() {
  await exigirUsuario("/pesquisas");
  const [buscas, cfg] = await Promise.all([listarBuscas(100), obterConfig("prospeccao")]);
  const fontes = todasAsFontes()
    .filter((f) => cfg.fontes[f.id]?.ativa)
    .map((f) => ({ id: f.id, nome: f.nome }));

  return (
    <div className="space-y-6">
      <Titulo>Pesquisas de prospecção</Titulo>
      <NovaPesquisa fontes={fontes} />

      {buscas.length === 0 ? (
        <Vazio>Nenhuma pesquisa ainda. Informe um segmento e uma cidade acima.</Vazio>
      ) : (
        <div className="cartao overflow-x-auto">
          <table className="tabela">
            <thead>
              <tr>
                <th>Pesquisa</th>
                <th>Status</th>
                <th className="w-48">Progresso</th>
                <th className="text-right">Encontradas</th>
                <th className="text-right">Analisadas</th>
                <th className="text-right">Qualificadas</th>
                <th className="text-right">Erros</th>
                <th className="text-right">Custo</th>
                <th>Criada</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {buscas.map((b) => (
                <tr key={b.id}>
                  <td>
                    <Link href={`/pesquisas/${b.id}`} className="font-medium text-marca-700 hover:underline">{b.nicho}</Link>
                    <div className="text-xs text-slate-500">{b.cidade} · {b.fontes.join(", ")}</div>
                  </td>
                  <td>
                    <span className={`selo ${COR_STATUS[b.status]}`}>{STATUS_BUSCA_ROTULO[b.status]}</span>
                    {b.erro && <div className="mt-1 max-w-56 text-xs text-rose-700">{b.erro}</div>}
                  </td>
                  <td>
                    <Barra valor={b.progresso} />
                    <div className="mt-1 text-xs text-slate-500">{b.progresso}% · {b.jobs.pendentes + b.jobs.rodando} tarefas na fila</div>
                  </td>
                  <td className="text-right tabular-nums">{b.encontradas}</td>
                  <td className="text-right tabular-nums">{b.analisadas}</td>
                  <td className={`text-right text-base font-bold tabular-nums ${b.qualificadas ? "text-emerald-600" : "text-slate-400"}`}>{b.qualificadas}</td>
                  <td className={`text-right tabular-nums ${b.erros ? "text-rose-700" : ""}`}>{b.erros}</td>
                  <td className="text-right text-xs tabular-nums text-slate-500">{usd(b.custoUsd)}</td>
                  <td className="whitespace-nowrap text-xs text-slate-500">{dataHora(b.criadoEm)}</td>
                  <td className="whitespace-nowrap">
                    <div className="flex flex-col items-end gap-1">
                      {["pendente", "descobrindo", "processando"].includes(b.status) && <CancelarPesquisa id={b.id} />}
                      {!["pendente", "descobrindo", "processando"].includes(b.status) && <RefazerPesquisa id={b.id} nome={`${b.nicho} — ${b.cidade}`} />}
                      <ExcluirPesquisa id={b.id} nome={`${b.nicho} — ${b.cidade}`} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <AtualizarAoVivo tipos={["busca.atualizada", "lead.novo"]} />
    </div>
  );
}
