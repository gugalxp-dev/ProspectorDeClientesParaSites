"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { chamarApi } from "../api";

interface Item {
  nome: string;
  rotulo: string;
  origem: "env" | "painel" | null;
  final: string | null;
}

export function Credenciais({ itens }: { itens: Item[] }) {
  return (
    <ul className="divide-y divide-slate-100">
      {itens.map((c) => (
        <LinhaCredencial key={c.nome} item={c} />
      ))}
    </ul>
  );
}

function LinhaCredencial({ item }: { item: Item }) {
  const router = useRouter();
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState("");
  const [erro, setErro] = useState<string | null>(null);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    try {
      await chamarApi(`/api/admin/credenciais/${item.nome}`, { metodo: "PUT", corpo: { valor } });
      setValor("");
      setEditando(false);
      router.refresh();
    } catch (e) {
      setErro((e as Error).message);
    }
  }

  return (
    <li className="py-2 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-0 flex-1">
          <div>{item.rotulo}</div>
          <code className="text-xs text-slate-500">{item.nome}</code>
        </div>
        <span className="text-xs text-slate-600">
          {item.origem ? `${item.origem === "env" ? ".env" : "painel"} · ••••${item.final}` : <span className="text-amber-700">não configurada</span>}
        </span>
        {item.origem !== "env" && (
          <button className="botao-sec" onClick={() => setEditando(!editando)}>{item.origem ? "Trocar" : "Cadastrar"}</button>
        )}
        {item.origem === "painel" && (
          <button
            className="botao-perigo"
            onClick={async () => {
              await chamarApi(`/api/admin/credenciais/${item.nome}`, { metodo: "DELETE" });
              router.refresh();
            }}
          >
            Remover
          </button>
        )}
      </div>
      {editando && (
        <form onSubmit={salvar} className="mt-2 flex gap-2">
          <input type="password" autoComplete="off" className="campo" value={valor} onChange={(e) => setValor(e.target.value)} placeholder="Cole o valor (não será exibido de novo)" required minLength={4} aria-label={item.rotulo} />
          <button className="botao">Salvar</button>
        </form>
      )}
      {erro && <p className="erro mt-1">{erro}</p>}
    </li>
  );
}

export function TestarIntegracao({ integracao }: { integracao: "ia" | "whatsapp" }) {
  const [r, setR] = useState<{ ok: boolean; simulado: boolean; detalhe: string; aviso?: string | null } | null>(null);
  const [ocupado, setOcupado] = useState(false);
  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        className="botao-sec"
        disabled={ocupado}
        onClick={async () => {
          setOcupado(true);
          try {
            setR(await chamarApi(`/api/admin/testar/${integracao}`, { corpo: {} }));
          } catch (e) {
            setR({ ok: false, simulado: false, detalhe: (e as Error).message });
          } finally {
            setOcupado(false);
          }
        }}
      >
        {ocupado ? "Testando…" : "Testar conexão"}
      </button>
      {r && (
        <span className={`text-sm ${!r.ok ? "text-rose-700" : r.simulado ? "text-amber-700" : "text-emerald-700"}`}>
          {!r.ok ? "Falhou: " : r.simulado ? "Simulado (não é teste real): " : "OK: "}
          {r.detalhe}
        </span>
      )}
    </div>
  );
}
