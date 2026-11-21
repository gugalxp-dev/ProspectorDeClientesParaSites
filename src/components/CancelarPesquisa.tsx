"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { chamarApi } from "./api";

export function CancelarPesquisa({ id }: { id: string }) {
  const router = useRouter();
  const [confirmar, setConfirmar] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  if (!confirmar) {
    return (
      <button className="text-xs text-slate-500 hover:text-rose-700" onClick={() => setConfirmar(true)}>
        Cancelar
      </button>
    );
  }
  return (
    <span className="flex gap-2 text-xs">
      <button
        className="text-rose-700 hover:underline"
        disabled={ocupado}
        onClick={async () => {
          setOcupado(true);
          await chamarApi(`/api/pesquisas/${id}`, { metodo: "DELETE" }).catch(() => undefined);
          router.refresh();
        }}
      >
        Confirmar
      </button>
      <button className="text-slate-500" onClick={() => setConfirmar(false)}>Não</button>
    </span>
  );
}
