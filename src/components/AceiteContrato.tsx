"use client";

import { useState } from "react";
import { CheckCircle2, Printer } from "lucide-react";
import { chamarApi } from "./api";

/** Formulário de aceite eletrônico do contrato (página pública). */
export function AceiteContrato({ token, nomeSugerido }: { token: string; nomeSugerido: string }) {
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aceito, setAceito] = useState(false);

  if (aceito) {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-emerald-300 bg-emerald-50 p-4 text-emerald-900">
        <CheckCircle2 className="size-6 shrink-0" />
        <div>
          <strong>Contrato aceito!</strong> Obrigado. Em breve entraremos em contato para os próximos passos.
        </div>
      </div>
    );
  }

  return (
    <form
      className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4 print:hidden"
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        setEnviando(true);
        setErro(null);
        try {
          await chamarApi(`/api/contrato-publico/${token}`, { corpo: { nome: f.get("nome"), documento: f.get("documento"), concordo: f.get("concordo") === "on" } });
          setAceito(true);
        } catch (e) {
          setErro((e as Error).message);
        } finally {
          setEnviando(false);
        }
      }}
    >
      <h2 className="font-semibold text-slate-900">Aceite eletrônico</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="rotulo" htmlFor="nome">Nome completo do responsável *</label>
          <input id="nome" name="nome" required minLength={5} maxLength={200} defaultValue={nomeSugerido} className="campo" />
        </div>
        <div>
          <label className="rotulo" htmlFor="documento">CPF ou CNPJ *</label>
          <input id="documento" name="documento" required inputMode="numeric" maxLength={20} className="campo" placeholder="000.000.000-00" />
        </div>
      </div>
      <label className="flex items-start gap-2 text-sm text-slate-700">
        <input type="checkbox" name="concordo" required className="mt-1" /> Li todo o contrato e concordo com os termos. Entendo que este aceite eletrônico tem validade de assinatura.
      </label>
      {erro && <p className="erro">{erro}</p>}
      <div className="flex flex-wrap gap-2">
        <button className="botao" disabled={enviando}>{enviando ? "Registrando..." : "Aceito o contrato"}</button>
        <BotaoImprimir />
      </div>
    </form>
  );
}

export function BotaoImprimir() {
  return (
    <button type="button" className="botao-sec print:hidden" onClick={() => window.print()}>
      <Printer className="size-4" /> Imprimir / salvar PDF
    </button>
  );
}
