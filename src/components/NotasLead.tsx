"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { chamarApi } from "./api";

export function NotasLead({ id, notas, responsavelId, usuarios }: { id: string; notas: string | null; responsavelId: string | null; usuarios: Array<{ id: string; nome: string }> }) {
  const router = useRouter();
  const [texto, setTexto] = useState(notas ?? "");
  const [resp, setResp] = useState(responsavelId ?? "");
  const [estado, setEstado] = useState<string | null>(null);

  async function salvar() {
    setEstado("Salvando…");
    try {
      await chamarApi(`/api/leads/${id}`, { metodo: "PATCH", corpo: { notas: texto || null, responsavelId: resp || null } });
      setEstado("Salvo.");
      router.refresh();
    } catch (e) {
      setEstado((e as Error).message);
    }
  }

  return (
    <section className="cartao space-y-2 p-4 text-sm">
      <h2 className="font-medium">Observações internas</h2>
      <div>
        <label className="rotulo" htmlFor="responsavel">Responsável</label>
        <select id="responsavel" className="campo" value={resp} onChange={(e) => setResp(e.target.value)}>
          <option value="">Ninguém</option>
          {usuarios.map((u) => (
            <option key={u.id} value={u.id}>{u.nome}</option>
          ))}
        </select>
      </div>
      <textarea className="campo" rows={4} maxLength={10_000} value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Anotações visíveis só para a equipe" aria-label="Observações internas" />
      <div className="flex items-center gap-2">
        <button className="botao-sec" onClick={salvar}>Salvar</button>
        {estado && <span className="text-xs text-slate-500">{estado}</span>}
      </div>
    </section>
  );
}
