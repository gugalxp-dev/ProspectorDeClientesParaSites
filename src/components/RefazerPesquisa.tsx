"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { RotateCw } from "lucide-react";
import { chamarApi } from "./api";
import { ModalConfirmacao } from "./ModalConfirmacao";

/** Refaz a pesquisa com as regras atuais (mesmo segmento e cidade), com confirmação. */
export function RefazerPesquisa({ id, nome, botao }: { id: string; nome: string; botao?: boolean }) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function refazer() {
    setOcupado(true);
    setErro(null);
    try {
      await chamarApi(`/api/pesquisas/${id}/refazer`, { corpo: {} });
      setAberto(false);
      router.refresh();
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setOcupado(false);
    }
  }

  return (
    <>
      <button
        className={botao ? "botao-sec" : "inline-flex items-center gap-1 text-xs text-slate-500 hover:text-marca-700"}
        onClick={() => setAberto(true)}
        title={`Refazer a pesquisa ${nome}`}
      >
        <RotateCw className={botao ? "size-4" : "size-3.5"} /> Refazer
      </button>
      <ModalConfirmacao
        aberto={aberto}
        titulo="Refazer pesquisa?"
        textoConfirmar="Refazer agora"
        ocupado={ocupado}
        erro={erro}
        aoConfirmar={refazer}
        aoFechar={() => {
          setAberto(false);
          setErro(null);
        }}
      >
        <p>
          A pesquisa <strong className="text-slate-900">{nome}</strong> será feita de novo com as regras e fontes atuais.
        </p>
        <p className="mt-2">As empresas já encontradas continuam (sem duplicar) e as conversas não são afetadas.</p>
      </ModalConfirmacao>
    </>
  );
}
