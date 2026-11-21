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
  const f: FiltrosLead = {
    texto: sp.texto?.slice(0, 100) || undefined,
    cidade: sp.cidade?.slice(0, 80) || undefined,
    segmento: sp.segmento?.slice(0, 80) || undefined,
    presenca: (PRESENCAS as readonly string[]).includes(sp.presenca ?? "") ? sp.presenca : undefined,
    scoreMin: sp.scoreMin && /^\d{1,3}$/.test(sp.scoreMin) ? Number(sp.scoreMin) : undefined,
    buscaId: sp.buscaId?.slice(0, 40) || undefined,
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
        {f.buscaId && <input type="hidden" name="buscaId" value={f.buscaId} />}
      </form>
      <Kanban colunas={dados} />
      <AtualizarAoVivo tipos={["lead.atualizado", "lead.novo"]} />
    </div>
  );
}
