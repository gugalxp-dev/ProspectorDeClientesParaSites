"use client";

// Modal de confirmação centralizado. Usa <dialog> nativo com showModal(): fundo escurecido,
// foco preso dentro do modal, Esc fecha e o foco volta para onde estava ao fechar.

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle } from "lucide-react";

export function ModalConfirmacao(p: {
  aberto: boolean;
  titulo: string;
  children: React.ReactNode;
  textoConfirmar: string;
  ocupado?: boolean;
  erro?: string | null;
  perigo?: boolean;
  aoConfirmar: () => void;
  aoFechar: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const idTitulo = useId();
  const cancelar = useRef<HTMLButtonElement>(null);
  // Vai direto no <body>: dentro de tabela/flex o modal herdaria estilos (ex.: nowrap) e o texto vazaria.
  const [montado, setMontado] = useState(false);
  useEffect(() => {
    setMontado(true);
  }, []);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (p.aberto && !d.open) {
      d.showModal();
      cancelar.current?.focus(); // foco no "Cancelar": Enter por engano não apaga nada
    } else if (!p.aberto && d.open) {
      d.close();
    }
  }, [p.aberto, montado]);

  if (!montado) return null;
  return createPortal(
    <dialog
      ref={ref}
      aria-labelledby={idTitulo}
      className="m-auto w-[min(28rem,calc(100vw-2rem))] whitespace-normal break-words text-left text-base font-normal rounded-xl border border-slate-200 bg-superficie p-0 text-slate-900 shadow-2xl backdrop:bg-black/50 backdrop:backdrop-blur-sm"
      onCancel={(e) => {
        e.preventDefault(); // Esc: fecha pelo estado do React
        if (!p.ocupado) p.aoFechar();
      }}
      onClick={(e) => {
        if (e.target === ref.current && !p.ocupado) p.aoFechar(); // clique fora do conteúdo
      }}
    >
      <div className="space-y-4 p-5">
        <div className="flex items-start gap-3">
          {p.perigo && (
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-rose-100">
              <AlertTriangle className="size-5 text-rose-600" />
            </span>
          )}
          <div className="min-w-0 flex-1 space-y-1">
            <h2 id={idTitulo} className="text-lg font-semibold">{p.titulo}</h2>
            <div className="text-sm text-slate-600">{p.children}</div>
          </div>
        </div>
        {p.erro && <p className="erro">{p.erro}</p>}
        <div className="flex justify-end gap-2">
          <button ref={cancelar} type="button" className="botao-sec" disabled={p.ocupado} onClick={p.aoFechar}>Cancelar</button>
          <button type="button" className={p.perigo ? "botao-perigo" : "botao"} disabled={p.ocupado} onClick={p.aoConfirmar}>
            {p.ocupado ? "Aguarde..." : p.textoConfirmar}
          </button>
        </div>
      </div>
    </dialog>,
    document.body,
  );
}
