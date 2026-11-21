"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Search } from "lucide-react";
import { chamarApi } from "./api";

export function NovaPesquisa({ fontes }: { fontes: Array<{ id: string; nome: string }> }) {
  const router = useRouter();
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function criar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    setErro(null);
    setOk(null);
    setEnviando(true);
    try {
      await chamarApi("/api/pesquisas", {
        corpo: { nicho: f.get("nicho"), cidade: f.get("cidade"), fontes: f.getAll("fontes") },
        idempotente: true,
      });
      setOk(`Pesquisa "${f.get("nicho")} — ${f.get("cidade")}" iniciada. Você pode iniciar outras ao mesmo tempo.`);
      form.reset();
      router.refresh();
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={criar} className="cartao space-y-3 p-4">
      <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
        <div>
          <label className="rotulo" htmlFor="nicho">Tipo de negócio</label>
          <input id="nicho" name="nicho" required minLength={2} maxLength={80} className="campo" placeholder="Pet shops, salões de beleza, restaurantes…" />
        </div>
        <div>
          <label className="rotulo" htmlFor="cidade">Cidade</label>
          <input id="cidade" name="cidade" required minLength={2} maxLength={80} className="campo" placeholder="Praia Grande, SP" />
        </div>
        <div className="flex items-end">
          <button className="botao w-full md:w-auto" disabled={enviando || !fontes.length}>
            <Search className="size-4" /> {enviando ? "Iniciando…" : "Iniciar pesquisa"}
          </button>
        </div>
      </div>
      {fontes.length > 1 && (
        <fieldset className="flex flex-wrap gap-4 text-sm text-slate-700">
          <legend className="rotulo">Fontes</legend>
          {fontes.map((f) => (
            <label key={f.id} className="flex items-center gap-1.5">
              <input type="checkbox" name="fontes" value={f.id} defaultChecked /> {f.nome}
            </label>
          ))}
        </fieldset>
      )}
      {!fontes.length && <p className="erro">Nenhuma fonte de descoberta ativa. Um administrador precisa ativar em Admin &gt; Prospecção.</p>}
      {erro && <p className="erro" role="alert">{erro}</p>}
      {ok && <p className="sucesso">{ok}</p>}
    </form>
  );
}
