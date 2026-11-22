"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Trash2 } from "lucide-react";
import { chamarApi } from "./api";
import { ModalConfirmacao } from "./ModalConfirmacao";

/** Excluir pesquisa com modal de confirmação, mostrando quantas empresas saem junto. */
export function ExcluirPesquisa({ id, nome, voltarPara }: { id: string; nome: string; voltarPara?: string }) {
  const router = useRouter();
  const [empresas, setEmpresas] = useState<number | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function pedir() {
    setErro(null);
    try {
      setEmpresas((await chamarApi<{ empresas: number }>(`/api/pesquisas/${id}/excluir`)).empresas);
    } catch (e) {
      setErro((e as Error).message);
    }
  }

  async function excluir() {
    setOcupado(true);
    setErro(null);
    try {
      await chamarApi(`/api/pesquisas/${id}/excluir`, { corpo: {} });
      setEmpresas(null);
      if (voltarPara) router.push(voltarPara);
      router.refresh();
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setOcupado(false);
    }
  }

  return (
    <>
      <button className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-rose-700" onClick={pedir} title={`Excluir a pesquisa ${nome}`}>
        <Trash2 className="size-3.5" /> Excluir
      </button>
      {erro && empresas === null && <span className="ml-1 text-xs text-rose-700">{erro}</span>}
      <ModalConfirmacao
        aberto={empresas !== null}
        perigo
        titulo="Excluir pesquisa?"
        textoConfirmar="Sim, excluir"
        ocupado={ocupado}
        erro={erro}
        aoConfirmar={excluir}
        aoFechar={() => {
          setEmpresas(null);
          setErro(null);
        }}
      >
        <p>
          A pesquisa <strong className="text-slate-900">{nome}</strong> será excluída
          {empresas ? (
            <>
              {" "}junto com <strong className="text-slate-900">{empresas} empresa(s)</strong> encontrada(s) só por ela e ainda não contatada(s).
            </>
          ) : (
            "."
          )}
        </p>
        <p className="mt-2">Empresas em negociação, com contrato ou encontradas por outra pesquisa continuam no CRM. Não dá para desfazer.</p>
      </ModalConfirmacao>
    </>
  );
}
