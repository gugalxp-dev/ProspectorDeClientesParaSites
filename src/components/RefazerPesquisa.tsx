"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { RotateCw } from "lucide-react";
import { chamarApi } from "./api";
import { ModalConfirmacao } from "./ModalConfirmacao";

/** Refaz a pesquisa do zero (apaga os registros dela e busca de novo), com confirmação. */
export function RefazerPesquisa({ id, nome, botao }: { id: string; nome: string; botao?: boolean }) {
  const router = useRouter();
  const [empresas, setEmpresas] = useState<number | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function pedir() {
    setErro(null);
    try {
      setEmpresas((await chamarApi<{ empresas: number }>(`/api/pesquisas/${id}/refazer`)).empresas);
    } catch (e) {
      setErro((e as Error).message);
    }
  }

  async function refazer() {
    setOcupado(true);
    setErro(null);
    try {
      await chamarApi(`/api/pesquisas/${id}/refazer`, { corpo: {} });
      setEmpresas(null);
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
        onClick={pedir}
        title={`Refazer a pesquisa ${nome} do zero`}
      >
        <RotateCw className={botao ? "size-4" : "size-3.5"} /> Refazer
      </button>
      {erro && empresas === null && <span className="ml-1 text-xs text-rose-700">{erro}</span>}
      <ModalConfirmacao
        aberto={empresas !== null}
        perigo
        titulo="Refazer pesquisa do zero?"
        textoConfirmar="Sim, refazer"
        ocupado={ocupado}
        erro={erro}
        aoConfirmar={refazer}
        aoFechar={() => {
          setEmpresas(null);
          setErro(null);
        }}
      >
        <p>
          Todos os registros de <strong className="text-slate-900">{nome}</strong> serão apagados
          {empresas ? (
            <>
              , incluindo <strong className="text-slate-900">{empresas} empresa(s)</strong> ainda não contatada(s)
            </>
          ) : null}
          , e a pesquisa será feita de novo com as regras atuais.
        </p>
        <p className="mt-2">
          Empresas em conversa, com contrato ou encontradas por outra pesquisa continuam no CRM. O histórico de gastos é mantido. Não dá para desfazer.
        </p>
      </ModalConfirmacao>
    </>
  );
}
