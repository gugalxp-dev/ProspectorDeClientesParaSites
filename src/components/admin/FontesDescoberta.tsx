"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { chamarApi } from "../api";

interface Fonte {
  id: string;
  nome: string;
  descricao: string;
  aviso: string | null;
  gratuita: boolean;
  ativa: boolean;
  disponivel: { ok: boolean; motivo?: string };
}

export function FontesDescoberta({ fontes }: { fontes: Fonte[] }) {
  const router = useRouter();
  const [erro, setErro] = useState<string | null>(null);

  async function alternar(id: string, ativa: boolean) {
    setErro(null);
    try {
      const mapa = Object.fromEntries(fontes.map((f) => [f.id, { ativa: f.id === id ? ativa : f.ativa }]));
      await chamarApi("/api/admin/config/prospeccao", { metodo: "PUT", corpo: { fontes: mapa } });
      router.refresh();
    } catch (e) {
      setErro((e as Error).message);
    }
  }

  return (
    <section className="cartao p-4">
      <h2 className="mb-2 font-medium">Fontes de descoberta</h2>
      <p className="ajuda mb-3">Cada fonte é um módulo independente (src/core/fontes). Novas fontes podem ser adicionadas sem mudar o resto do sistema.</p>
      <ul className="space-y-3">
        {fontes.map((f) => (
          <li key={f.id} className="flex items-start gap-3 text-sm">
            <input type="checkbox" className="mt-1" checked={f.ativa} onChange={(e) => alternar(f.id, e.target.checked)} aria-label={`Ativar ${f.nome}`} />
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <strong>{f.nome}</strong>
                <span className={`selo ${f.gratuita ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>{f.gratuita ? "gratuita" : "paga"}</span>
                <span className={`selo ${f.disponivel.ok ? "bg-slate-100 text-slate-600" : "bg-rose-100 text-rose-800"}`}>{f.disponivel.ok ? "disponível" : f.disponivel.motivo}</span>
              </div>
              <p className="text-xs text-slate-600">{f.descricao}</p>
              {f.aviso && <p className="text-xs text-amber-800">⚠ {f.aviso}</p>}
            </div>
          </li>
        ))}
      </ul>
      {erro && <p className="erro mt-2">{erro}</p>}
    </section>
  );
}
