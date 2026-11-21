"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { chamarApi } from "../api";
import { COR_ETAPA } from "../ui";

interface Etapa {
  id?: string;
  nome: string;
  cor: string;
  sistema: boolean;
}

export function EditorEtapas({ etapas }: { etapas: Etapa[] }) {
  const router = useRouter();
  const [lista, setLista] = useState(etapas);
  const [estado, setEstado] = useState<string | null>(null);

  const mover = (i: number, d: number) => {
    const n = [...lista];
    [n[i], n[i + d]] = [n[i + d], n[i]];
    setLista(n);
  };

  async function salvar() {
    setEstado(null);
    try {
      await chamarApi("/api/admin/etapas", { metodo: "PUT", corpo: { etapas: lista.map(({ id, nome, cor }) => ({ id, nome, cor })) } });
      setEstado("Salvo.");
      router.refresh();
    } catch (e) {
      setEstado((e as Error).message);
    }
  }

  return (
    <div className="cartao space-y-2 p-4">
      {lista.map((e, i) => (
        <div key={e.id ?? `nova-${i}`} className="flex items-center gap-2">
          <span className={`size-3 shrink-0 rounded-full ${COR_ETAPA[e.cor]}`} />
          <input className="campo" value={e.nome} maxLength={60} onChange={(ev) => setLista(lista.map((x, j) => (j === i ? { ...x, nome: ev.target.value } : x)))} aria-label="Nome da etapa" />
          <select className="campo w-32" value={e.cor} onChange={(ev) => setLista(lista.map((x, j) => (j === i ? { ...x, cor: ev.target.value } : x)))} aria-label="Cor">
            {Object.keys(COR_ETAPA).map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <button className="rounded p-1 hover:bg-slate-100 disabled:opacity-30" disabled={i === 0} onClick={() => mover(i, -1)} aria-label="Subir"><ArrowUp className="size-4" /></button>
          <button className="rounded p-1 hover:bg-slate-100 disabled:opacity-30" disabled={i === lista.length - 1} onClick={() => mover(i, 1)} aria-label="Descer"><ArrowDown className="size-4" /></button>
          {e.sistema ? (
            <span className="w-16 text-center text-[10px] text-slate-400">automação</span>
          ) : (
            <button className="w-16 rounded p-1 text-rose-600 hover:bg-rose-50" onClick={() => setLista(lista.filter((_, j) => j !== i))} aria-label="Remover"><Trash2 className="mx-auto size-4" /></button>
          )}
        </div>
      ))}
      <div className="flex items-center gap-2 pt-2">
        <button className="botao-sec" onClick={() => setLista([...lista, { nome: "Nova etapa", cor: "teal", sistema: false }])}><Plus className="size-4" /> Etapa</button>
        <button className="botao" onClick={salvar}>Salvar</button>
        {estado && <span className="text-sm text-slate-600">{estado}</span>}
      </div>
    </div>
  );
}
