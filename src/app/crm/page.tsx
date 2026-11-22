import Link from "next/link";
import { AtualizarAoVivo } from "@/components/AoVivo";
import { Kanban, type ColunaKanban } from "@/components/Kanban";
import { Titulo } from "@/components/ui";
import { quadroKanban, type FiltrosLead } from "@/core/crm/leads";
import { db } from "@/core/db";
import { PRESENCA_ROTULO, PRESENCAS } from "@/core/tipos";
import { exigirUsuario } from "@/lib/auth";

type SP = Promise<Record<string, string | undefined>>;

export default async function Crm({ searchParams }: { searchParams: SP }) {
  await exigirUsuario("/crm");
  const sp = await searchParams;
  // Pesquisas que têm leads, da mais recente para a mais antiga. Sem escolha: mostra a mais recente.
  const buscas = await db.busca.findMany({
    where: { leads: { some: { lead: { qualificacaoStatus: { not: "descartado" } } } } },
    orderBy: { criadoEm: "desc" },
    select: { id: true, nicho: true, cidade: true, _count: { select: { leads: { where: { lead: { qualificacaoStatus: "qualificado" } } } } } },
  });
  const buscaSel = sp.buscaId === "todas" ? "todas" : buscas.find((b) => b.id === sp.buscaId)?.id ?? buscas[0]?.id ?? "todas";
  const f: FiltrosLead = {
    texto: sp.texto?.slice(0, 100) || undefined,
    cidade: sp.cidade?.slice(0, 80) || undefined,
    segmento: sp.segmento?.slice(0, 80) || undefined,
    presenca: (PRESENCAS as readonly string[]).includes(sp.presenca ?? "") ? sp.presenca : undefined,
    scoreMin: sp.scoreMin && /^\d{1,3}$/.test(sp.scoreMin) ? Number(sp.scoreMin) : undefined,
    buscaId: buscaSel === "todas" ? undefined : buscaSel,
    incluirBaixo: sp.baixo === "1",
  };
  const [colunas, usuarios] = await Promise.all([quadroKanban(f), db.usuario.findMany({ select: { id: true, nome: true } })]);
  const nomes = Object.fromEntries(usuarios.map((u) => [u.id, u.nome]));
  const dados: ColunaKanban[] = colunas.map((c) => ({
    etapa: { id: c.etapa.id, nome: c.etapa.nome, cor: c.etapa.cor },
    total: c.total,
    leads: c.leads.map((l) => ({
      ...l,
      criadoEm: l.criadoEm.toISOString(),
      ultimaInteracaoEm: l.ultimaInteracaoEm?.toISOString() ?? null,
      responsavel: l.responsavelId ? (nomes[l.responsavelId] ?? null) : null,
    })),
  }));

  return (
    <div className="space-y-4">
      <Titulo>CRM</Titulo>
      <nav className="flex flex-wrap gap-2" aria-label="Pesquisa">
        {buscas.map((b) => (
          <Link key={b.id} href={`/crm?buscaId=${b.id}`} className={`rounded-full border px-3 py-1 text-sm ${buscaSel === b.id ? "border-marca-500 bg-marca-600 text-white" : "border-slate-200 text-slate-600 hover:bg-slate-100"}`}>
            {b.nicho} · {b.cidade} <span className="ml-1 text-xs opacity-80">{b._count.leads} qualif.</span>
          </Link>
        ))}
        <Link href="/crm?buscaId=todas" className={`rounded-full border px-3 py-1 text-sm ${buscaSel === "todas" ? "border-marca-500 bg-marca-600 text-white" : "border-slate-200 text-slate-600 hover:bg-slate-100"}`}>
          Todas as pesquisas
        </Link>
      </nav>
      <form className="cartao grid grid-cols-2 gap-3 p-3 md:grid-cols-6" method="get">
        <input name="texto" defaultValue={f.texto} className="campo col-span-2" placeholder="Nome, endereço ou telefone" aria-label="Buscar" />
        <input name="segmento" defaultValue={f.segmento} className="campo" placeholder="Segmento" aria-label="Segmento" />
        <input name="cidade" defaultValue={f.cidade} className="campo" placeholder="Cidade" aria-label="Cidade" />
        <select name="presenca" defaultValue={f.presenca ?? ""} className="campo" aria-label="Presença web">
          <option value="">Toda presença web</option>
          {PRESENCAS.map((p) => (
            <option key={p} value={p}>{PRESENCA_ROTULO[p]}</option>
          ))}
        </select>
        <div className="flex gap-2">
          <input name="scoreMin" type="number" min={0} max={100} defaultValue={f.scoreMin} className="campo" placeholder="Score mín." aria-label="Score mínimo" />
          <button className="botao">Filtrar</button>
        </div>
        <input type="hidden" name="buscaId" value={buscaSel} />
        <label className="col-span-2 flex items-center gap-2 text-xs text-slate-600 md:col-span-6">
          <input type="checkbox" name="baixo" value="1" defaultChecked={f.incluirBaixo} /> Mostrar também os de baixo potencial
        </label>
      </form>
      <Kanban colunas={dados} />
      <AtualizarAoVivo tipos={["lead.atualizado", "lead.novo"]} />
    </div>
  );
}
