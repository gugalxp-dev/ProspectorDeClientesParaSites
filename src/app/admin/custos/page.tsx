// Painel de gastos: total do período, divisão por categoria, uso, serviço/modelo, pesquisa e lead, gráfico diário
// e cada chamada registrada. Tudo vem de RegistroCusto (uma linha por chamada paga ou simulada).

import Link from "next/link";
import { Titulo, dataHora, usd } from "@/components/ui";
import { obterConfig } from "@/core/config";
import { db } from "@/core/db";
import { exigirAdmin } from "@/lib/auth";

const PERIODOS = [
  ["hoje", "Hoje"],
  ["7d", "7 dias"],
  ["30d", "30 dias"],
  ["mes", "Este mês"],
  ["mes_passado", "Mês passado"],
  ["tudo", "Tudo"],
] as const;
type Periodo = (typeof PERIODOS)[number][0];

const CATEGORIA: Record<string, [string, string]> = {
  ia: ["IA (OpenAI)", "from-violet-600 to-fuchsia-600"],
  whatsapp: ["WhatsApp", "from-emerald-500 to-teal-600"],
  descoberta: ["Descoberta (Google Places)", "from-sky-500 to-cyan-500"],
};

const OPERACAO: Record<string, string> = {
  qualificacao: "Qualificação de leads",
  agente: "Agente comercial (respostas no WhatsApp)",
  embedding: "Embeddings da base de conhecimento",
  teste: "Testes de conexão",
  resumo: "Resumos",
  mensagem_template: "Templates de primeiro contato",
  descoberta: "Busca de empresas (Google Places)",
};

const POR_PAGINA = 50;

function intervalo(p: Periodo): { desde?: Date; ate?: Date } {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const diasAtras = (n: number) => new Date(hoje.getTime() - (n - 1) * 86_400_000);
  switch (p) {
    case "hoje":
      return { desde: hoje };
    case "7d":
      return { desde: diasAtras(7) };
    case "30d":
      return { desde: diasAtras(30) };
    case "mes":
      return { desde: new Date(hoje.getFullYear(), hoje.getMonth(), 1) };
    case "mes_passado":
      return { desde: new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1), ate: new Date(hoje.getFullYear(), hoje.getMonth(), 1) };
    default:
      return {};
  }
}

function chaveDia(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function soma<T>(itens: T[], f: (x: T) => number | null | undefined): number {
  return itens.reduce((s, x) => s + (f(x) ?? 0), 0);
}

function agrupar<T>(itens: T[], chave: (x: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const x of itens) {
    const k = chave(x);
    m.set(k, [...(m.get(k) ?? []), x]);
  }
  return m;
}

const num = (n: number) => n.toLocaleString("pt-BR");

export default async function AdminCustos({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await exigirAdmin("/admin/custos");
  const sp = await searchParams;
  const periodo: Periodo = PERIODOS.some(([p]) => p === sp.periodo) ? (sp.periodo as Periodo) : "mes";
  const filtroCategoria = sp.categoria && CATEGORIA[sp.categoria] ? sp.categoria : undefined;
  const filtroOperacao = sp.operacao && /^[a-z_]{1,40}$/.test(sp.operacao) ? sp.operacao : undefined;
  const pagina = Math.max(1, Math.min(1000, Number(sp.pagina) || 1));
  const { desde, ate } = intervalo(periodo);

  const where = {
    ...(desde || ate ? { criadoEm: { ...(desde ? { gte: desde } : {}), ...(ate ? { lt: ate } : {}) } } : {}),
    ...(filtroCategoria ? { categoria: filtroCategoria } : {}),
    ...(filtroOperacao ? { operacao: filtroOperacao } : {}),
  };

  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1);

  const [registros, detalhes, totalDetalhes, cfgIa, iaHoje, iaMes] = await Promise.all([
    db.registroCusto.findMany({
      where,
      select: { categoria: true, provedor: true, modelo: true, operacao: true, tokensEntrada: true, tokensSaida: true, quantidade: true, custoUsd: true, sucesso: true, latenciaMs: true, buscaId: true, leadId: true, conversaId: true, criadoEm: true },
    }),
    db.registroCusto.findMany({ where, orderBy: { criadoEm: "desc" }, skip: (pagina - 1) * POR_PAGINA, take: POR_PAGINA }),
    db.registroCusto.count({ where }),
    obterConfig("ia"),
    db.registroCusto.aggregate({ _sum: { custoUsd: true }, where: { categoria: "ia", criadoEm: { gte: hoje } } }),
    db.registroCusto.aggregate({ _sum: { custoUsd: true }, where: { categoria: "ia", criadoEm: { gte: inicioMes } } }),
  ]);

  const total = soma(registros, (r) => r.custoUsd);
  const falhas = registros.filter((r) => !r.sucesso).length;
  const semPreco = registros.filter((r) => r.custoUsd == null).length;
  const simuladas = registros.filter((r) => r.provedor === "mock").length;
  const tokensEntrada = soma(registros, (r) => r.tokensEntrada);
  const tokensSaida = soma(registros, (r) => r.tokensSaida);

  // Projeção do mês corrente (gasto até hoje / dias passados × dias do mês).
  const diaDoMes = new Date().getDate();
  const diasNoMes = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).getDate();
  const projecao = periodo === "mes" && !filtroOperacao ? (total / diaDoMes) * diasNoMes : null;

  const porCategoria = [...agrupar(registros, (r) => r.categoria)].map(([k, l]) => ({ k, custo: soma(l, (r) => r.custoUsd), chamadas: l.length })).sort((a, b) => b.custo - a.custo);
  const porOperacao = [...agrupar(registros, (r) => `${r.categoria}|${r.operacao}`)]
    .map(([k, l]) => {
      const [categoria, operacao] = k.split("|");
      return { categoria, operacao, custo: soma(l, (r) => r.custoUsd), chamadas: l.length, entrada: soma(l, (r) => r.tokensEntrada), saida: soma(l, (r) => r.tokensSaida), falhas: l.filter((r) => !r.sucesso).length };
    })
    .sort((a, b) => b.custo - a.custo || b.chamadas - a.chamadas);
  const porServico = [...agrupar(registros, (r) => `${r.provedor}|${r.modelo ?? ""}`)]
    .map(([k, l]) => {
      const [provedor, modelo] = k.split("|");
      const lat = l.filter((r) => r.latenciaMs != null);
      return { provedor, modelo, custo: soma(l, (r) => r.custoUsd), chamadas: l.length, entrada: soma(l, (r) => r.tokensEntrada), saida: soma(l, (r) => r.tokensSaida), latencia: lat.length ? Math.round(soma(lat, (r) => r.latenciaMs) / lat.length) : null };
    })
    .sort((a, b) => b.custo - a.custo || b.chamadas - a.chamadas);

  // Gráfico diário (no máximo os últimos 31 dias com registro).
  const porDia = [...agrupar(registros, (r) => chaveDia(r.criadoEm))]
    .map(([dia, l]) => ({ dia, custo: soma(l, (r) => r.custoUsd), cats: [...agrupar(l, (r) => r.categoria)].map(([c, x]) => ({ c, v: soma(x, (r) => r.custoUsd) })) }))
    .sort((a, b) => a.dia.localeCompare(b.dia))
    .slice(-31);
  const maxDia = Math.max(0, ...porDia.map((d) => d.custo));

  const topo = <K extends "buscaId" | "leadId" | "conversaId">(campo: K) =>
    [...agrupar(registros.filter((r) => r[campo]), (r) => r[campo] as string)]
      .map(([id, l]) => ({ id, custo: soma(l, (r) => r.custoUsd), chamadas: l.length }))
      .sort((a, b) => b.custo - a.custo || b.chamadas - a.chamadas)
      .slice(0, 10);
  const topBuscas = topo("buscaId");
  const topLeads = topo("leadId");
  const conversasComCusto = new Set(registros.filter((r) => r.conversaId).map((r) => r.conversaId)).size;
  const custoConversas = soma(registros.filter((r) => r.conversaId), (r) => r.custoUsd);
  const leadsQualificados = new Set(registros.filter((r) => r.operacao === "qualificacao" && r.leadId).map((r) => r.leadId)).size;
  const custoQualificacao = soma(registros.filter((r) => r.operacao === "qualificacao"), (r) => r.custoUsd);

  const idsLead = [...new Set([...topLeads.map((l) => l.id), ...detalhes.map((d) => d.leadId).filter(Boolean)])] as string[];
  const idsBusca = [...new Set([...topBuscas.map((b) => b.id), ...detalhes.map((d) => d.buscaId).filter(Boolean)])] as string[];
  const [leads, buscas] = await Promise.all([
    db.lead.findMany({ where: { id: { in: idsLead } }, select: { id: true, nome: true, cidade: true } }),
    db.busca.findMany({ where: { id: { in: idsBusca } }, select: { id: true, nicho: true, cidade: true } }),
  ]);
  const nomeLead = new Map(leads.map((l) => [l.id, `${l.nome}${l.cidade ? ` (${l.cidade})` : ""}`]));
  const nomeBusca = new Map(buscas.map((b) => [b.id, `${b.nicho} — ${b.cidade}`]));

  const link = (mudar: Record<string, string | undefined>) => {
    const q = new URLSearchParams();
    const atual: Record<string, string | undefined> = { periodo, categoria: filtroCategoria, operacao: filtroOperacao, ...mudar };
    for (const [k, v] of Object.entries(atual)) if (v && !(k === "periodo" && v === "mes")) q.set(k, v);
    const s = q.toString();
    return s ? `?${s}` : "?";
  };
  const paginas = Math.max(1, Math.ceil(totalDetalhes / POR_PAGINA));
  const pct = (v: number) => (total > 0 ? (v / total) * 100 : 0);
  const rotuloPeriodo = PERIODOS.find(([p]) => p === periodo)![1];

  return (
    <>
      <Titulo>Gastos</Titulo>
      <p className="text-sm text-slate-600">
        Valores <strong>estimados</strong>: uso informado pelo provedor × tabela de preços (
        <Link href="/admin/ia" className="text-marca-700 underline">IA</Link>, <Link href="/admin/whatsapp" className="text-marca-700 underline">WhatsApp</Link>,{" "}
        <Link href="/admin/prospeccao" className="text-marca-700 underline">Google Places</Link>). O valor cobrado de fato está no faturamento de cada provedor. Operações simuladas custam zero.
      </p>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2 text-sm">
        {PERIODOS.map(([p, r]) => (
          <Link key={p} href={link({ periodo: p })} className={`rounded-full border px-3 py-1 transition ${periodo === p ? "border-transparent bg-linear-to-r from-violet-600 to-fuchsia-600 text-white shadow-md shadow-fuchsia-600/25" : "border-slate-300 bg-superficie hover:border-marca-500"}`}>
            {r}
          </Link>
        ))}
        <span className="mx-1 h-5 w-px bg-slate-300" />
        {[undefined, ...Object.keys(CATEGORIA)].map((c) => (
          <Link key={c ?? "todas"} href={link({ categoria: c, operacao: undefined })} className={`rounded-full border px-3 py-1 transition ${filtroCategoria === c ? "border-marca-500 bg-marca-50 text-marca-700" : "border-slate-300 bg-superficie hover:border-marca-500"}`}>
            {c ? CATEGORIA[c][0] : "Todas as categorias"}
          </Link>
        ))}
        {filtroOperacao && (
          <Link href={link({ operacao: undefined })} className="rounded-full border border-marca-500 bg-marca-50 px-3 py-1 text-marca-700">
            {OPERACAO[filtroOperacao] ?? filtroOperacao} ✕
          </Link>
        )}
      </div>

      {/* Indicadores */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="cartao relative overflow-hidden p-4 md:col-span-2">
          <div className="absolute inset-0 bg-linear-to-br from-violet-600/15 via-fuchsia-600/10 to-transparent" />
          <div className="relative">
            <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Total · {rotuloPeriodo}</div>
            <div className="titulo-gradiente text-4xl font-bold tabular-nums">{usd(total)}</div>
            <div className="mt-1 text-xs text-slate-500">
              {num(registros.length)} chamadas{simuladas ? ` (${num(simuladas)} simuladas)` : ""}
              {projecao != null && <> · projeção do mês: <strong className="text-slate-700">{usd(projecao)}</strong></>}
            </div>
          </div>
        </div>
        <Indicador titulo="IA hoje" valor={usd(iaHoje._sum.custoUsd ?? 0)} extra={cfgIa.limiteDiarioUsd ? `limite ${usd(cfgIa.limiteDiarioUsd)}` : "sem limite"} progresso={cfgIa.limiteDiarioUsd ? ((iaHoje._sum.custoUsd ?? 0) / cfgIa.limiteDiarioUsd) * 100 : undefined} />
        <Indicador titulo="IA no mês" valor={usd(iaMes._sum.custoUsd ?? 0)} extra={cfgIa.limiteMensalUsd ? `limite ${usd(cfgIa.limiteMensalUsd)}` : "sem limite"} progresso={cfgIa.limiteMensalUsd ? ((iaMes._sum.custoUsd ?? 0) / cfgIa.limiteMensalUsd) * 100 : undefined} />
        <Indicador titulo="Tokens (entrada / saída)" valor={`${num(tokensEntrada)} / ${num(tokensSaida)}`} />
        <Indicador titulo="Por lead qualificado pela IA" valor={leadsQualificados ? usd(custoQualificacao / leadsQualificados) : "—"} extra={`${num(leadsQualificados)} leads`} />
        <Indicador titulo="Por conversa no WhatsApp" valor={conversasComCusto ? usd(custoConversas / conversasComCusto) : "—"} extra={`${num(conversasComCusto)} conversas`} />
        <Indicador titulo="Falhas / sem preço" valor={`${num(falhas)} / ${num(semPreco)}`} extra={semPreco ? "cadastre o preço do modelo em Admin > IA" : undefined} alerta={falhas > 0 || semPreco > 0} />
      </div>

      {/* Por categoria */}
      <section className="cartao p-4">
        <h2 className="mb-3 font-semibold">Por categoria</h2>
        {porCategoria.length ? (
          <>
            <div className="mb-3 flex h-3 overflow-hidden rounded-full bg-slate-100">
              {porCategoria.map((c) => (
                <div key={c.k} className={`bg-linear-to-r ${CATEGORIA[c.k]?.[1] ?? "from-zinc-500 to-zinc-500"}`} style={{ width: `${pct(c.custo)}%` }} title={`${CATEGORIA[c.k]?.[0] ?? c.k}: ${usd(c.custo)}`} />
              ))}
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              {porCategoria.map((c) => (
                <Link key={c.k} href={link({ categoria: c.k, operacao: undefined })} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-sm transition hover:border-marca-500">
                  <span className="flex items-center gap-2">
                    <span className={`size-2.5 rounded-full bg-linear-to-r ${CATEGORIA[c.k]?.[1] ?? "from-zinc-500 to-zinc-500"}`} />
                    {CATEGORIA[c.k]?.[0] ?? c.k}
                  </span>
                  <span className="text-right tabular-nums">
                    <strong>{usd(c.custo)}</strong> <span className="text-xs text-slate-500">· {pct(c.custo).toFixed(0)}% · {num(c.chamadas)}</span>
                  </span>
                </Link>
              ))}
            </div>
          </>
        ) : (
          <p className="text-sm text-slate-500">Nenhum gasto registrado neste período.</p>
        )}
      </section>

      {/* Gráfico diário */}
      {porDia.length > 0 && (
        <section className="cartao p-4">
          <h2 className="mb-3 font-semibold">Gasto por dia</h2>
          <div className="flex h-40 items-end gap-1">
            {porDia.map((d) => (
              <div key={d.dia} className="group relative flex h-full min-w-0 flex-1 flex-col justify-end" title={`${d.dia.split("-").reverse().join("/")}: ${usd(d.custo)}`}>
                <div className="flex flex-col-reverse overflow-hidden rounded-t-md" style={{ height: `${maxDia > 0 ? Math.max(2, (d.custo / maxDia) * 100) : 2}%` }}>
                  {d.cats.map((c) => (
                    <div key={c.c} className={`bg-linear-to-t ${CATEGORIA[c.c]?.[1] ?? "from-zinc-500 to-zinc-500"}`} style={{ flexGrow: d.custo > 0 ? c.v / d.custo : 1 / d.cats.length }} />
                  ))}
                </div>
                <div className="mt-1 truncate text-center text-[10px] text-slate-500">{d.dia.slice(8)}/{d.dia.slice(5, 7)}</div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Por uso */}
      <section className="cartao overflow-x-auto p-4">
        <h2 className="mb-2 font-semibold">Por uso</h2>
        <table className="tabela">
          <thead>
            <tr><th>Uso</th><th>Categoria</th><th className="text-right">Chamadas</th><th className="text-right">Falhas</th><th className="text-right">Tokens entrada</th><th className="text-right">Tokens saída</th><th className="text-right">Custo médio</th><th className="text-right">Custo</th><th className="w-32">%</th></tr>
          </thead>
          <tbody>
            {porOperacao.map((o) => (
              <tr key={`${o.categoria}|${o.operacao}`}>
                <td><Link href={link({ operacao: o.operacao })} className="font-medium text-marca-700 hover:underline">{OPERACAO[o.operacao] ?? o.operacao}</Link></td>
                <td className="text-xs text-slate-500">{CATEGORIA[o.categoria]?.[0] ?? o.categoria}</td>
                <td className="text-right tabular-nums">{num(o.chamadas)}</td>
                <td className={`text-right tabular-nums ${o.falhas ? "text-rose-700" : ""}`}>{num(o.falhas)}</td>
                <td className="text-right tabular-nums">{num(o.entrada)}</td>
                <td className="text-right tabular-nums">{num(o.saida)}</td>
                <td className="text-right tabular-nums">{usd(o.chamadas ? o.custo / o.chamadas : 0)}</td>
                <td className="text-right font-semibold tabular-nums">{usd(o.custo)}</td>
                <td><BarraPct valor={pct(o.custo)} /></td>
              </tr>
            ))}
            {!porOperacao.length && <tr><td colSpan={9} className="text-slate-500">Nada neste período.</td></tr>}
          </tbody>
        </table>
      </section>

      {/* Por serviço */}
      <section className="cartao overflow-x-auto p-4">
        <h2 className="mb-2 font-semibold">Por serviço e modelo</h2>
        <table className="tabela">
          <thead>
            <tr><th>Provedor</th><th>Modelo / produto</th><th className="text-right">Chamadas</th><th className="text-right">Tokens entrada</th><th className="text-right">Tokens saída</th><th className="text-right">Latência média</th><th className="text-right">Custo</th><th className="w-32">%</th></tr>
          </thead>
          <tbody>
            {porServico.map((s) => (
              <tr key={`${s.provedor}|${s.modelo}`}>
                <td className="font-medium">{s.provedor === "mock" ? "Simulado (mock)" : s.provedor}</td>
                <td className="text-xs">{s.modelo || "—"}</td>
                <td className="text-right tabular-nums">{num(s.chamadas)}</td>
                <td className="text-right tabular-nums">{num(s.entrada)}</td>
                <td className="text-right tabular-nums">{num(s.saida)}</td>
                <td className="text-right tabular-nums">{s.latencia != null ? `${num(s.latencia)} ms` : "—"}</td>
                <td className="text-right font-semibold tabular-nums">{usd(s.custo)}</td>
                <td><BarraPct valor={pct(s.custo)} /></td>
              </tr>
            ))}
            {!porServico.length && <tr><td colSpan={8} className="text-slate-500">Nada neste período.</td></tr>}
          </tbody>
        </table>
      </section>

      {/* Por pesquisa e por lead */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Ranking titulo="Pesquisas que mais gastaram" itens={topBuscas.map((b) => ({ ...b, nome: nomeBusca.get(b.id) ?? "Pesquisa excluída", href: `/pesquisas/${b.id}` }))} />
        <Ranking titulo="Leads que mais gastaram" itens={topLeads.map((l) => ({ ...l, nome: nomeLead.get(l.id) ?? "Lead excluído", href: `/leads/${l.id}` }))} />
      </div>

      {/* Detalhe de cada chamada */}
      <section className="cartao overflow-x-auto p-4">
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-semibold">Cada chamada</h2>
          <span className="text-xs text-slate-500">{num(totalDetalhes)} registros · página {pagina} de {paginas}</span>
        </div>
        <table className="tabela">
          <thead>
            <tr><th>Quando</th><th>Uso</th><th>Serviço</th><th>Referência</th><th className="text-right">Tokens</th><th className="text-right">Latência</th><th>Status</th><th className="text-right">Custo</th></tr>
          </thead>
          <tbody>
            {detalhes.map((d) => (
              <tr key={d.id}>
                <td className="whitespace-nowrap text-xs">{dataHora(d.criadoEm)}</td>
                <td>{OPERACAO[d.operacao] ?? d.operacao}</td>
                <td className="text-xs">{d.provedor === "mock" ? "simulado" : d.provedor}{d.modelo ? ` · ${d.modelo}` : ""}</td>
                <td className="max-w-56 truncate text-xs">
                  {d.leadId ? <Link href={`/leads/${d.leadId}`} className="text-marca-700 hover:underline">{nomeLead.get(d.leadId) ?? "lead"}</Link>
                    : d.buscaId ? <Link href={`/pesquisas/${d.buscaId}`} className="text-marca-700 hover:underline">{nomeBusca.get(d.buscaId) ?? "pesquisa"}</Link>
                    : <span className="text-slate-400">—</span>}
                </td>
                <td className="whitespace-nowrap text-right text-xs tabular-nums">{d.tokensEntrada != null ? `${num(d.tokensEntrada)} → ${num(d.tokensSaida ?? 0)}` : d.quantidade > 1 ? `${d.quantidade}×` : "—"}</td>
                <td className="text-right text-xs tabular-nums">{d.latenciaMs != null ? `${num(d.latenciaMs)} ms` : "—"}</td>
                <td>{d.sucesso ? <span className="selo bg-emerald-100 text-emerald-800">ok</span> : <span className="selo bg-rose-100 text-rose-800" title={d.erro ?? ""}>falhou</span>}</td>
                <td className="text-right font-medium tabular-nums">{d.custoUsd == null ? <span className="text-amber-700" title="Modelo sem preço cadastrado">sem preço</span> : usd(d.custoUsd)}</td>
              </tr>
            ))}
            {!detalhes.length && <tr><td colSpan={8} className="text-slate-500">Nenhuma chamada neste período.</td></tr>}
          </tbody>
        </table>
        {paginas > 1 && (
          <div className="mt-3 flex justify-end gap-2 text-sm">
            {pagina > 1 && <Link className="botao-sec" href={link({ pagina: String(pagina - 1) })}>← Anterior</Link>}
            {pagina < paginas && <Link className="botao-sec" href={link({ pagina: String(pagina + 1) })}>Próxima →</Link>}
          </div>
        )}
      </section>
    </>
  );
}

function Indicador({ titulo, valor, extra, progresso, alerta }: { titulo: string; valor: string; extra?: string; progresso?: number; alerta?: boolean }) {
  return (
    <div className={`cartao p-4 ${alerta ? "border-amber-300" : ""}`}>
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{titulo}</div>
      <div className="mt-1 text-xl font-bold tabular-nums">{valor}</div>
      {progresso != null && (
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
          <div className={`h-full rounded-full bg-linear-to-r ${progresso >= 90 ? "from-rose-600 to-orange-500" : "from-violet-600 to-fuchsia-500"}`} style={{ width: `${Math.min(100, progresso)}%` }} />
        </div>
      )}
      {extra && <div className="mt-1 text-xs text-slate-500">{extra}</div>}
    </div>
  );
}

function BarraPct({ valor }: { valor: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
        <div className="h-full rounded-full bg-linear-to-r from-violet-600 to-fuchsia-500" style={{ width: `${valor}%` }} />
      </div>
      <span className="w-9 text-right text-xs tabular-nums text-slate-500">{valor.toFixed(0)}%</span>
    </div>
  );
}

function Ranking({ titulo, itens }: { titulo: string; itens: Array<{ id: string; nome: string; href: string; custo: number; chamadas: number }> }) {
  const max = Math.max(0, ...itens.map((i) => i.custo));
  return (
    <section className="cartao p-4">
      <h2 className="mb-3 font-semibold">{titulo}</h2>
      <ul className="space-y-2 text-sm">
        {itens.map((i) => (
          <li key={i.id}>
            <div className="flex items-baseline justify-between gap-2">
              <Link href={i.href} className="truncate text-marca-700 hover:underline">{i.nome}</Link>
              <span className="shrink-0 tabular-nums"><strong>{usd(i.custo)}</strong> <span className="text-xs text-slate-500">· {num(i.chamadas)} chamadas</span></span>
            </div>
            <div className="mt-1 h-1 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full bg-linear-to-r from-violet-600 to-fuchsia-500" style={{ width: `${max > 0 ? (i.custo / max) * 100 : 0}%` }} />
            </div>
          </li>
        ))}
        {!itens.length && <li className="text-slate-500">Nada neste período.</li>}
      </ul>
    </section>
  );
}
