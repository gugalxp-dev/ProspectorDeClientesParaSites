"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Check, Send, X } from "lucide-react";
import { chamarApi } from "./api";
import { Score, SeloPresenca, telefoneFmt } from "./ui";

interface LeadAprovar {
  id: string;
  nome: string;
  cidade: string | null;
  segmento: string | null;
  score: number | null;
  presenca: string;
  revisao: number;
  whatsappE164: string | null;
  telefoneE164: string | null;
}

/** Fila de leads esperando você aprovar o primeiro contato. Aprovar = agenda o envio (fila espaçada, horário comercial). */
export function AprovarContatos({ leads, etapaPerdidoId }: { leads: LeadAprovar[]; etapaPerdidoId: string | null }) {
  const router = useRouter();
  const [feitos, setFeitos] = useState<Record<string, "aprovado" | "descartado">>({});
  const [horarios, setHorarios] = useState<Record<string, string>>({});
  const [erros, setErros] = useState<Record<string, string>>({});
  const [ocupado, setOcupado] = useState<string | null>(null);

  async function aprovar(id: string): Promise<boolean> {
    setOcupado(id);
    try {
      const r = await chamarApi<{ quando: string }>(`/api/leads/${id}/agendar`, { corpo: {} });
      setFeitos((f) => ({ ...f, [id]: "aprovado" }));
      setHorarios((h) => ({ ...h, [id]: new Date(r.quando).toLocaleString("pt-BR", { weekday: "short", hour: "2-digit", minute: "2-digit" }) }));
      setErros((er) => {
        const resto = { ...er };
        delete resto[id];
        return resto;
      });
      return true;
    } catch (e) {
      setErros((er) => ({ ...er, [id]: (e as Error).message }));
      return false;
    } finally {
      setOcupado(null);
    }
  }

  async function descartar(l: LeadAprovar) {
    if (!etapaPerdidoId) return;
    setOcupado(l.id);
    try {
      await chamarApi(`/api/leads/${l.id}/mover`, { corpo: { etapaId: etapaPerdidoId, revisao: l.revisao } });
      setFeitos((f) => ({ ...f, [l.id]: "descartado" }));
    } catch (e) {
      setErros((er) => ({ ...er, [l.id]: (e as Error).message }));
    } finally {
      setOcupado(null);
    }
  }

  async function aprovarTodos() {
    for (const l of leads) {
      if (feitos[l.id]) continue;
      if (!(await aprovar(l.id))) break; // para no primeiro bloqueio
    }
    router.refresh();
  }

  const restantes = leads.filter((l) => !feitos[l.id]).length;
  if (leads.length === 0) return <p className="text-sm text-slate-500">Nenhum lead esperando aprovação.</p>;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs text-slate-500">Aprovar coloca o primeiro contato na fila: sai um por vez, com intervalo aleatório e só no horário comercial (Admin &gt; WhatsApp). Os limites diários continuam valendo.</span>
        {restantes > 1 && (
          <button className="botao" disabled={!!ocupado} onClick={aprovarTodos}>
            <Check className="size-4" /> Aprovar todos ({restantes})
          </button>
        )}
      </div>
      <ul className="divide-y divide-slate-100">
        {leads.map((l) => (
          <li key={l.id} className={`flex flex-wrap items-center gap-3 py-2 text-sm ${feitos[l.id] ? "opacity-50" : ""}`}>
            <Score valor={l.score} />
            <div className="min-w-0 flex-1">
              <Link href={`/leads/${l.id}`} className="font-medium text-marca-700 hover:underline">{l.nome}</Link>
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <span>{[l.segmento, l.cidade].filter(Boolean).join(" · ")}</span>
                <span className="tabular-nums">{telefoneFmt(l.whatsappE164, l.telefoneE164)}</span>
                <SeloPresenca presenca={l.presenca} />
              </div>
              {erros[l.id] && <p className="text-xs text-rose-700">{erros[l.id]}</p>}
            </div>
            {feitos[l.id] ? (
              <span className={`selo ${feitos[l.id] === "aprovado" ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-600"}`}>
                {feitos[l.id] === "aprovado" ? `Agendado: ${horarios[l.id] ?? ""}` : "Descartado"}
              </span>
            ) : (
              <div className="flex gap-2">
                <button className="botao" disabled={!!ocupado} onClick={() => aprovar(l.id)}>
                  <Send className="size-4" /> {ocupado === l.id ? "Agendando..." : "Aprovar"}
                </button>
                {etapaPerdidoId && (
                  <button className="botao-sec" disabled={!!ocupado} onClick={() => descartar(l)} title="Mover para Perdido">
                    <X className="size-4" /> Descartar
                  </button>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

const horaCurta = (iso: string) => new Date(iso).toLocaleString("pt-BR", { weekday: "short", hour: "2-digit", minute: "2-digit" });

/** Primeiros contatos na fila, com o horário de envio e a opção de cancelar. */
export function EnviosAgendados({ itens }: { itens: Array<{ id: string; nome: string; cidade: string | null; segmento: string | null; quando: string }> }) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  async function cancelar(id: string) {
    setOcupado(id);
    setErro(null);
    try {
      await chamarApi(`/api/leads/${id}/cancelar_agendamento`, { corpo: {} });
      router.refresh();
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setOcupado(null);
    }
  }

  if (!itens.length) return <p className="text-sm text-slate-500">Nenhum envio na fila.</p>;
  return (
    <div className="space-y-1">
      <ul className="divide-y divide-slate-100">
        {itens.map((l) => (
          <li key={l.id} className="flex items-center gap-3 py-2 text-sm">
            <span className="w-28 shrink-0 font-mono text-xs tabular-nums text-violet-700">{horaCurta(l.quando)}</span>
            <div className="min-w-0 flex-1">
              <Link href={`/leads/${l.id}`} className="font-medium text-marca-700 hover:underline">{l.nome}</Link>
              <span className="ml-2 text-xs text-slate-500">{[l.segmento, l.cidade].filter(Boolean).join(" · ")}</span>
            </div>
            <button className="botao-sec" disabled={ocupado === l.id} onClick={() => cancelar(l.id)}>
              <X className="size-4" /> Cancelar
            </button>
          </li>
        ))}
      </ul>
      {erro && <p className="erro">{erro}</p>}
    </div>
  );
}

