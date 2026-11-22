"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { RefreshCw, Send, ShieldCheck, ShieldOff, Trash2 } from "lucide-react";
import { chamarApi } from "./api";
import { dataHora } from "./ui";

function useAcao() {
  const router = useRouter();
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  async function rodar(fn: () => Promise<unknown>, sucesso?: string) {
    setOcupado(true);
    setErro(null);
    setOk(null);
    try {
      await fn();
      if (sucesso) setOk(sucesso);
      router.refresh();
      return true;
    } catch (e) {
      setErro((e as Error).message);
      return false;
    } finally {
      setOcupado(false);
    }
  }
  return { ocupado, erro, ok, rodar };
}

export function Reprocessar({ id }: { id: string }) {
  const a = useAcao();
  return (
    <button className="botao-sec" disabled={a.ocupado} title={a.erro ?? a.ok ?? "Visitar o site e analisar de novo"} onClick={() => a.rodar(() => chamarApi(`/api/leads/${id}/reprocessar`, { corpo: {} }), "Reprocessamento na fila.")}>
      <RefreshCw className="size-4" /> {a.ok ? "Na fila" : "Reprocessar"}
    </button>
  );
}

interface Consentimento {
  id: string;
  tipo: string;
  origem: string;
  baseLegal: string | null;
  registradoPor: string | null;
  criadoEm: string;
}

export function AutorizacaoContato(p: { id: string; contatoStatus: string; telefone: string | null; temConversa: boolean; consentimentos: Consentimento[] }) {
  const a = useAcao();
  const [modo, setModo] = useState<"nada" | "optin" | "optout">("nada");

  return (
    <section className="cartao space-y-3 p-4 text-sm">
      <h2 className="font-medium">Contato e consentimento</h2>
      <p className="text-xs text-slate-600">
        Sem autorização registrada, &quot;Iniciar contato&quot; registra sozinho a base legal de legítimo interesse (contato comercial B2B). Opt-out bloqueia tudo, sempre.
      </p>

      {p.contatoStatus === "opt_out" ? (
        <p className="erro">Este contato pediu para não receber mensagens. Nenhum envio é permitido.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {p.contatoStatus !== "autorizado" && (
            <button className="botao-sec" onClick={() => setModo("optin")}>
              <ShieldCheck className="size-4" /> Registrar autorização
            </button>
          )}
          <button className="botao" disabled={a.ocupado} onClick={() => a.rodar(() => chamarApi(`/api/leads/${p.id}/contato`, { corpo: {} }), "Primeiro contato enviado.")}>
            <Send className="size-4" /> {p.temConversa ? "Enviar primeiro contato de novo" : "Iniciar contato"}
          </button>
          <button className="botao-perigo" onClick={() => setModo("optout")}>
            <ShieldOff className="size-4" /> Registrar opt-out
          </button>
        </div>
      )}

      {modo === "optin" && (
        <form
          className="space-y-2 rounded-md bg-slate-50 p-3"
          onSubmit={async (e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            const ok = await a.rodar(
              () =>
                chamarApi(`/api/leads/${p.id}/consentimento`, {
                  corpo: { origem: f.get("origem"), baseLegal: f.get("baseLegal"), evidencia: f.get("evidencia") || null, telefone: f.get("telefone") || null },
                }),
              "Autorização registrada.",
            );
            if (ok) setModo("nada");
          }}
        >
          <div>
            <label className="rotulo" htmlFor="origem">Como a autorização foi obtida *</label>
            <textarea id="origem" name="origem" required minLength={5} maxLength={500} rows={2} className="campo" placeholder="Ex.: pediu orçamento pelo formulário do site em 10/11; autorizou contato por WhatsApp" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="rotulo" htmlFor="baseLegal">Base legal (LGPD)</label>
              <select id="baseLegal" name="baseLegal" className="campo" defaultValue="consentimento">
                <option value="consentimento">Consentimento</option>
                <option value="legitimo_interesse">Legítimo interesse</option>
                <option value="execucao_contrato">Execução de contrato</option>
              </select>
            </div>
            <div>
              <label className="rotulo" htmlFor="telefone">WhatsApp autorizado</label>
              <input id="telefone" name="telefone" defaultValue={p.telefone ?? ""} className="campo" placeholder="+55 13 9..." />
            </div>
          </div>
          <div>
            <label className="rotulo" htmlFor="evidencia">Evidência (opcional)</label>
            <input id="evidencia" name="evidencia" maxLength={500} className="campo" placeholder="Nº do protocolo, print, e-mail…" />
          </div>
          <div className="flex gap-2">
            <button className="botao" disabled={a.ocupado}>Salvar autorização</button>
            <button type="button" className="botao-sec" onClick={() => setModo("nada")}>Cancelar</button>
          </div>
        </form>
      )}

      {modo === "optout" && (
        <form
          className="space-y-2 rounded-md bg-rose-50 p-3"
          onSubmit={async (e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            const ok = await a.rodar(() => chamarApi(`/api/leads/${p.id}/optout`, { corpo: { motivo: f.get("motivo") } }), "Opt-out registrado.");
            if (ok) setModo("nada");
          }}
        >
          <label className="rotulo" htmlFor="motivo">Motivo *</label>
          <input id="motivo" name="motivo" required minLength={3} maxLength={300} className="campo" placeholder="Ex.: pediu por telefone para não ser contatado" />
          <p className="text-xs text-rose-800">O número entra na lista de supressão e não poderá mais receber mensagens.</p>
          <div className="flex gap-2">
            <button className="botao-perigo" disabled={a.ocupado}>Confirmar opt-out</button>
            <button type="button" className="botao-sec" onClick={() => setModo("nada")}>Cancelar</button>
          </div>
        </form>
      )}

      {a.erro && <p className="erro">{a.erro}</p>}
      {a.ok && <p className="sucesso">{a.ok}</p>}

      {p.consentimentos.length > 0 && (
        <ul className="space-y-1 border-t border-slate-100 pt-2 text-xs">
          {p.consentimentos.map((c) => (
            <li key={c.id}>
              <span className={`selo mr-1 ${c.tipo === "opt_in" ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"}`}>{c.tipo === "opt_in" ? "Opt-in" : "Opt-out"}</span>
              {c.origem} <span className="text-slate-400">({c.baseLegal ?? "—"} · {c.registradoPor === "cliente" ? "pelo cliente" : "manual"} · {dataHora(c.criadoEm)})</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function ExcluirDados({ id, nome }: { id: string; nome: string }) {
  const a = useAcao();
  const [aberto, setAberto] = useState(false);
  return (
    <section className="cartao border-rose-200 p-4 text-sm">
      <h2 className="mb-1 font-medium text-rose-800">LGPD: excluir dados</h2>
      <p className="mb-2 text-xs text-slate-600">Apaga o lead, conversas e histórico. O telefone fica bloqueado (só o hash) para nunca mais receber mensagens.</p>
      {!aberto ? (
        <button className="botao-perigo" onClick={() => setAberto(true)}><Trash2 className="size-4" /> Excluir dados de {nome}</button>
      ) : (
        <form
          className="space-y-2"
          onSubmit={async (e) => {
            e.preventDefault();
            const motivo = new FormData(e.currentTarget).get("motivo");
            const ok = await a.rodar(() => chamarApi(`/api/leads/${id}`, { metodo: "DELETE", corpo: { motivo } }));
            if (ok) window.location.href = "/crm";
          }}
        >
          <input name="motivo" required minLength={3} maxLength={500} className="campo" placeholder="Motivo (ex.: pedido do titular)" aria-label="Motivo da exclusão" />
          <div className="flex gap-2">
            <button className="botao-perigo" disabled={a.ocupado}>Excluir definitivamente</button>
            <button type="button" className="botao-sec" onClick={() => setAberto(false)}>Cancelar</button>
          </div>
          {a.erro && <p className="erro">{a.erro}</p>}
        </form>
      )}
    </section>
  );
}
