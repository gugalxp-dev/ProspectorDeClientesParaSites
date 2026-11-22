"use client";

// Kanban com colunas configuráveis. Arrastar (ou o seletor do cartão, no celular/teclado) move o lead;
// a tela atualiza na hora e volta atrás se o servidor recusar (ex.: 409, alterado em outra aba).

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Bot, Globe, Phone, User } from "lucide-react";
import { chamarApi } from "./api";
import { COR_ETAPA, Score, SeloPresenca, data, dataHora, telefoneFmt } from "./ui";

export interface CartaoLead {
  id: string;
  nome: string;
  segmento: string | null;
  categoria: string | null;
  cidade: string | null;
  telefone: string | null;
  website: string | null;
  presenca: string;
  score: number | null;
  pontuacaoRegra: number;
  qualificacaoStatus: string;
  contatoStatus: string;
  etapaId: string | null;
  responsavel: string | null;
  criadoEm: string;
  ultimaInteracaoEm: string | null;
  automacaoPausada: boolean;
  revisao: number;
}

export interface ColunaKanban {
  etapa: { id: string; nome: string; cor: string };
  total: number;
  leads: CartaoLead[];
}

export function Kanban({ colunas }: { colunas: ColunaKanban[] }) {
  const router = useRouter();
  const [estado, setEstado] = useState(colunas);
  const [sobre, setSobre] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  useEffect(() => {
    setEstado(colunas);
  }, [colunas]);

  async function mover(leadId: string, paraEtapa: string) {
    const origem = estado.find((c) => c.leads.some((l) => l.id === leadId));
    const lead = origem?.leads.find((l) => l.id === leadId);
    if (!origem || !lead || origem.etapa.id === paraEtapa) return;
    const antes = estado;
    setErro(null);
    setEstado(
      estado.map((c) =>
        c.etapa.id === origem.etapa.id
          ? { ...c, total: c.total - 1, leads: c.leads.filter((l) => l.id !== leadId) }
          : c.etapa.id === paraEtapa
            ? { ...c, total: c.total + 1, leads: [{ ...lead, etapaId: paraEtapa }, ...c.leads] }
            : c,
      ),
    );
    try {
      await chamarApi(`/api/leads/${leadId}/mover`, { corpo: { etapaId: paraEtapa, revisao: lead.revisao } });
      router.refresh();
    } catch (e) {
      setEstado(antes);
      setErro((e as Error).message);
      router.refresh();
    }
  }

  return (
    <div className="space-y-2">
      {erro && <p className="erro" role="alert">{erro}</p>}
      <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-4">
        {estado.map((c) => (
          <section
            key={c.etapa.id}
            className={`flex ${c.total === 0 ? "w-44 opacity-70" : "w-72"} shrink-0 flex-col rounded-lg border bg-slate-100/70 ${sobre === c.etapa.id ? "border-marca-500 ring-2 ring-marca-100" : "border-slate-200"}`}
            onDragOver={(e) => {
              e.preventDefault();
              setSobre(c.etapa.id);
            }}
            onDragLeave={() => setSobre(null)}
            onDrop={(e) => {
              e.preventDefault();
              setSobre(null);
              void mover(e.dataTransfer.getData("text/plain"), c.etapa.id);
            }}
            aria-label={c.etapa.nome}
          >
            <header className="flex items-center gap-2 px-3 py-2 text-sm font-medium">
              <span className={`size-2.5 rounded-full ${COR_ETAPA[c.etapa.cor] ?? "bg-slate-400"}`} />
              <span className="truncate">{c.etapa.nome}</span>
              <span className="ml-auto text-xs tabular-nums text-slate-500">{c.total}</span>
            </header>
            <div className="flex max-h-[70vh] min-h-24 flex-col gap-2 overflow-y-auto px-2 pb-2">
              {c.leads.map((l) => (
                <Cartao key={l.id} lead={l} etapas={estado.map((x) => x.etapa)} mover={mover} />
              ))}
              {c.total > c.leads.length && <p className="px-1 text-center text-xs text-slate-500">+{c.total - c.leads.length} (use os filtros)</p>}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

function Cartao({ lead: l, etapas, mover }: { lead: CartaoLead; etapas: ColunaKanban["etapa"][]; mover: (id: string, etapa: string) => void }) {
  return (
    <article
      draggable
      onDragStart={(e) => e.dataTransfer.setData("text/plain", l.id)}
      className="cursor-grab rounded-md border border-slate-200 bg-superficie p-2.5 text-sm shadow-sm active:cursor-grabbing"
    >
      <div className="flex items-start gap-2">
        <Score valor={l.score ?? l.pontuacaoRegra} />
        <div className="min-w-0 flex-1">
          <Link href={`/leads/${l.id}`} className="block truncate font-medium text-slate-900 hover:text-marca-700">{l.nome}</Link>
          <div className="truncate text-xs text-slate-500">{[l.segmento ?? l.categoria, l.cidade].filter(Boolean).join(" · ")}</div>
        </div>
        {l.automacaoPausada && <span title="Automação pausada (atendimento humano)"><Bot className="size-4 text-rose-500" /></span>}
      </div>
      <div className="mt-2 flex flex-wrap gap-1">
        <SeloPresenca presenca={l.presenca} />
      </div>
      <dl className="mt-2 space-y-0.5 text-xs text-slate-600">
        {l.telefone && (
          <div className="flex items-center gap-1 tabular-nums"><Phone className="size-3" /> {telefoneFmt(l.telefone)}</div>
        )}
        {l.website && (
          <div className="flex items-center gap-1 truncate"><Globe className="size-3 shrink-0" /> <span className="truncate">{l.website.replace(/^https?:\/\//, "")}</span></div>
        )}
        {l.responsavel && (
          <div className="flex items-center gap-1"><User className="size-3" /> {l.responsavel}</div>
        )}
        <div className="text-slate-400">Descoberto {data(l.criadoEm)}{l.ultimaInteracaoEm ? ` · última interação ${dataHora(l.ultimaInteracaoEm)}` : ""}</div>
      </dl>
      <select
        className="mt-2 w-full rounded border border-slate-200 bg-slate-50 px-1 py-0.5 text-xs text-slate-600"
        value={l.etapaId ?? ""}
        onChange={(e) => mover(l.id, e.target.value)}
        aria-label={`Mover ${l.nome} para outra etapa`}
      >
        {etapas.map((e) => (
          <option key={e.id} value={e.id}>{e.nome}</option>
        ))}
      </select>
    </article>
  );
}
