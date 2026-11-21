"use client";

// Lista editável genérica (base de conhecimento, serviços): criar, editar, excluir, com validação no servidor.

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { chamarApi } from "../api";

export interface CampoCrud {
  nome: string;
  rotulo: string;
  tipo: "texto" | "area" | "numero" | "booleano" | "reais";
  obrigatorio?: boolean;
  ajuda?: string;
}

type Registro = Record<string, unknown> & { id: string };

export function Crud({ url, campos, itens, resumo, novoPadrao }: { url: string; campos: CampoCrud[]; itens: Registro[]; resumo: (r: Registro) => React.ReactNode; novoPadrao: Record<string, unknown> }) {
  const router = useRouter();
  const [editando, setEditando] = useState<Registro | "novo" | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  async function salvar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const corpo: Record<string, unknown> = {};
    for (const c of campos) {
      const v = f.get(c.nome);
      if (c.tipo === "booleano") corpo[c.nome] = v === "on";
      else if (c.tipo === "numero") corpo[c.nome] = Number(v);
      else if (c.tipo === "reais") corpo[c.nome] = Math.round(Number(String(v).replace(/\./g, "").replace(",", ".")) * 100);
      else corpo[c.nome] = v ? String(v) : null;
    }
    setErro(null);
    try {
      if (editando === "novo") await chamarApi(url, { corpo, idempotente: true });
      else if (editando) await chamarApi(`${url}/${editando.id}`, { metodo: "PUT", corpo });
      setEditando(null);
      router.refresh();
    } catch (e) {
      setErro((e as Error).message);
    }
  }

  async function excluir(id: string) {
    setErro(null);
    try {
      await chamarApi(`${url}/${id}`, { metodo: "DELETE" });
      router.refresh();
    } catch (e) {
      setErro((e as Error).message);
    }
  }

  const atual = editando === "novo" ? novoPadrao : editando;

  return (
    <div className="space-y-3">
      {!editando && (
        <button className="botao" onClick={() => setEditando("novo")}>
          <Plus className="size-4" /> Adicionar
        </button>
      )}
      {atual && (
        <form onSubmit={salvar} className="cartao space-y-3 p-4">
          <div className="grid gap-3 md:grid-cols-2">
            {campos.map((c) => {
              const v = atual[c.nome];
              const id = `crud-${c.nome}`;
              const largo = c.tipo === "area";
              return (
                <div key={c.nome} className={largo ? "md:col-span-2" : ""}>
                  {c.tipo === "booleano" ? (
                    <label className="flex items-center gap-2 text-sm">
                      <input type="checkbox" name={c.nome} defaultChecked={v !== false} /> {c.rotulo}
                    </label>
                  ) : (
                    <>
                      <label className="rotulo" htmlFor={id}>{c.rotulo}{c.obrigatorio ? " *" : ""}</label>
                      {c.tipo === "area" ? (
                        <textarea id={id} name={c.nome} rows={6} className="campo" defaultValue={String(v ?? "")} required={c.obrigatorio} />
                      ) : (
                        <input
                          id={id}
                          name={c.nome}
                          className="campo"
                          required={c.obrigatorio}
                          inputMode={c.tipo === "texto" ? undefined : "decimal"}
                          defaultValue={c.tipo === "reais" ? (v == null ? "" : (Number(v) / 100).toFixed(2).replace(".", ",")) : String(v ?? "")}
                        />
                      )}
                    </>
                  )}
                  {c.ajuda && <p className="ajuda">{c.ajuda}</p>}
                </div>
              );
            })}
          </div>
          {erro && <p className="erro">{erro}</p>}
          <div className="flex gap-2">
            <button className="botao">Salvar</button>
            <button type="button" className="botao-sec" onClick={() => setEditando(null)}>Cancelar</button>
          </div>
        </form>
      )}
      {!editando && erro && <p className="erro">{erro}</p>}
      <ul className="space-y-2">
        {itens.map((r) => (
          <li key={r.id} className="cartao flex items-start gap-3 p-3 text-sm">
            <div className="min-w-0 flex-1">{resumo(r)}</div>
            <button className="rounded p-1 text-slate-500 hover:bg-slate-100" onClick={() => setEditando(r)} aria-label="Editar"><Pencil className="size-4" /></button>
            <ExcluirBotao onConfirmar={() => excluir(r.id)} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function ExcluirBotao({ onConfirmar }: { onConfirmar: () => void }) {
  const [confirmar, setConfirmar] = useState(false);
  if (confirmar) {
    return (
      <span className="flex gap-2 text-xs">
        <button className="text-rose-700 hover:underline" onClick={onConfirmar}>Excluir</button>
        <button className="text-slate-500" onClick={() => setConfirmar(false)}>Não</button>
      </span>
    );
  }
  return (
    <button className="rounded p-1 text-slate-500 hover:bg-rose-50 hover:text-rose-700" onClick={() => setConfirmar(true)} aria-label="Excluir"><Trash2 className="size-4" /></button>
  );
}
