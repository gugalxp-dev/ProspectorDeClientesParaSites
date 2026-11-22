import Link from "next/link";
import { ExcluirPesquisa } from "@/components/ExcluirPesquisa";
import { RefazerPesquisa } from "@/components/RefazerPesquisa";
import { notFound } from "next/navigation";
import { AtualizarAoVivo } from "@/components/AoVivo";
import { Barra, Score, SeloPresenca, SeloQualificacao, Titulo, Vazio, dataHora, usd } from "@/components/ui";
import { resumoBusca } from "@/core/busca";
import { db } from "@/core/db";
import { STATUS_BUSCA_ROTULO } from "@/core/tipos";
import { exigirUsuario } from "@/lib/auth";

export default async function Pesquisa({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ filtro?: string }> }) {
  const { id } = await params;
  const { filtro } = await searchParams;
  await exigirUsuario(`/pesquisas/${id}`);
  const r = await resumoBusca(id);
  if (!r) notFound();

  const where = {
    buscas: { some: { buscaId: id } },
    ...(filtro === "qualificados" ? { qualificacaoStatus: "qualificado" } : {}),
    ...(filtro === "sem_site" ? { presenca: { in: ["sem_site_identificado", "so_rede_social", "site_fora_do_ar"] } } : {}),
  };
  const [leads, logs] = await Promise.all([
    db.lead.findMany({
      where,
      orderBy: [{ score: "desc" }, { pontuacaoRegra: "desc" }],
      take: 500,
      select: { id: true, nome: true, categoria: true, telefone: true, website: true, presenca: true, presencaConfianca: true, score: true, pontuacaoRegra: true, qualificacaoStatus: true, buscas: { where: { buscaId: id }, select: { novo: true } } },
    }),
    db.logOperacao.findMany({ where: { buscaId: id }, orderBy: { criadoEm: "desc" }, take: 30 }),
  ]);

  const filtros = [
    [undefined, "Todas"],
    ["qualificados", "Qualificadas"],
    ["sem_site", "Sem site próprio"],
  ] as const;

  return (
    <div className="space-y-6">
      <Titulo
        acoes={
          <div className="flex items-center gap-3">
            {!["pendente", "descobrindo", "processando"].includes(r.status) && <RefazerPesquisa id={r.id} nome={`${r.nicho} — ${r.cidade}`} botao />}
            <ExcluirPesquisa id={r.id} nome={`${r.nicho} — ${r.cidade}`} voltarPara="/pesquisas" />
          </div>
        }
      >
        {r.nicho} — {r.cidade}
      </Titulo>
      <div className="cartao grid gap-4 p-4 sm:grid-cols-3 lg:grid-cols-7">
        <div className="sm:col-span-3 lg:col-span-2">
          <div className="text-xs text-slate-500">{STATUS_BUSCA_ROTULO[r.status]} · criada {dataHora(r.criadoEm)}</div>
          <div className="mt-2"><Barra valor={r.progresso} /></div>
          <div className="mt-1 text-xs text-slate-500">{r.progresso}% · fontes: {r.fontes.join(", ")}</div>
          {r.erro && <p className="erro mt-2">{r.erro}</p>}
        </div>
        <div className="sm:col-span-1 lg:col-span-2">
          <div className="text-xs font-medium text-slate-500">Qualificadas (prontas para contato)</div>
          <div className="text-4xl font-bold tabular-nums text-emerald-600">{r.qualificadas}</div>
          <Link href={`/crm?buscaId=${r.id}`} className="text-xs text-marca-600 hover:underline">Ver no CRM</Link>
        </div>
        {(
          [
            ["Encontradas", r.encontradas, ""],
            ["Ignoradas", r.descartadas, "Rede/franquia, sem celular/WhatsApp ou já com site bom"],
            ["Erros", r.erros, ""],
          ] as const
        ).map(([t, v, dica]) => (
          <div key={t} title={dica}>
            <div className="text-xs text-slate-500">{t}</div>
            <div className={`text-xl font-semibold tabular-nums ${t === "Erros" && v ? "text-rose-700" : "text-slate-600"}`}>{v}</div>
          </div>
        ))}
      </div>
      <p className="text-xs text-slate-500">Custo estimado desta pesquisa: {usd(r.custoUsd)}</p>

      <nav className="flex gap-1 text-sm">
        {filtros.map(([f, rotulo]) => (
          <Link key={rotulo} href={f ? `?filtro=${f}` : "?"} className={`rounded-full border px-3 py-1 ${filtro === f ? "border-transparent bg-linear-to-r from-violet-600 to-fuchsia-600 text-white shadow-md shadow-fuchsia-600/25" : "border-slate-300 bg-superficie hover:border-marca-500"}`}>
            {rotulo}
          </Link>
        ))}
      </nav>

      {leads.length === 0 ? (
        <Vazio>{r.status === "concluida" ? "Nenhuma empresa neste filtro." : "Aguardando resultados…"}</Vazio>
      ) : (
        <div className="cartao overflow-x-auto">
          <table className="tabela">
            <thead>
              <tr>
                <th>Score</th>
                <th>Empresa</th>
                <th>Presença web</th>
                <th>Telefone</th>
                <th>Qualificação</th>
              </tr>
            </thead>
            <tbody>
              {leads.map((l) => (
                <tr key={l.id}>
                  <td><Score valor={l.score ?? l.pontuacaoRegra} /></td>
                  <td>
                    <Link href={`/leads/${l.id}`} className="font-medium text-marca-700 hover:underline">{l.nome}</Link>
                    {l.buscas[0] && !l.buscas[0].novo && <span className="ml-2 selo bg-slate-100 text-slate-500" title="Já existia de outra pesquisa (deduplicada)">já conhecida</span>}
                    <div className="text-xs text-slate-500">{l.categoria}</div>
                  </td>
                  <td><SeloPresenca presenca={l.presenca} confianca={l.presencaConfianca} /></td>
                  <td className="whitespace-nowrap text-xs">{l.telefone ?? "—"}</td>
                  <td><SeloQualificacao status={l.qualificacaoStatus} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {logs.length > 0 && (
        <section className="cartao p-4">
          <h2 className="mb-2 font-medium">Registro de execução</h2>
          <ul className="space-y-1 text-xs">
            {logs.map((l) => (
              <li key={l.id} className={l.nivel === "erro" ? "text-rose-700" : l.nivel === "aviso" ? "text-amber-700" : "text-slate-600"}>
                <span className="text-slate-400">{dataHora(l.criadoEm)}</span> [{l.etapa}] {l.mensagem}
              </li>
            ))}
          </ul>
        </section>
      )}
      <AtualizarAoVivo tipos={["busca.atualizada", "lead.atualizado", "lead.novo"]} filtro={{ buscaId: id }} />
    </div>
  );
}
