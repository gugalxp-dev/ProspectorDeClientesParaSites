"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { chamarApi } from "../api";

export function EditorPrecos({ precos }: { precos: Record<string, { entradaPorMilhao: number; saidaPorMilhao: number }> }) {
  const router = useRouter();
  const [texto, setTexto] = useState(JSON.stringify(precos, null, 2));
  const [estado, setEstado] = useState<string | null>(null);
  return (
    <details className="mt-3">
      <summary className="cursor-pointer text-xs text-marca-700">Editar tabela (JSON)</summary>
      <textarea className="campo mt-2 font-mono text-xs" rows={8} value={texto} onChange={(e) => setTexto(e.target.value)} aria-label="Tabela de preços em JSON" />
      <div className="mt-2 flex items-center gap-2">
        <button
          className="botao-sec"
          onClick={async () => {
            try {
              await chamarApi("/api/admin/config/ia", { metodo: "PUT", corpo: { precos: JSON.parse(texto) } });
              setEstado("Salvo.");
              router.refresh();
            } catch (e) {
              setEstado((e as Error).message);
            }
          }}
        >
          Salvar preços
        </button>
        {estado && <span className="text-xs text-slate-600">{estado}</span>}
      </div>
    </details>
  );
}
