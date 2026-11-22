"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Bell, LogOut } from "lucide-react";
import { chamarApi } from "./api";
import { useEventos } from "./AoVivo";
import { dataHora } from "./ui";

interface Notificacao {
  id: string;
  tipo: string;
  titulo: string;
  mensagem: string;
  leadId: string | null;
  lidaEm: string | null;
  criadoEm: string;
}

export function Notificacoes() {
  const [lista, setLista] = useState<Notificacao[]>([]);
  const [aberto, setAberto] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);

  const carregar = useCallback(() => {
    chamarApi<Notificacao[]>("/api/notificacoes").then(setLista).catch(() => undefined);
  }, []);
  useEffect(carregar, [carregar]);
  useEventos((tipo) => {
    if (tipo === "notificacao.nova" || tipo === "reconectado") carregar();
  });
  useEffect(() => {
    const fechar = (e: MouseEvent) => {
      if (caixa.current && !caixa.current.contains(e.target as Node)) setAberto(false);
    };
    document.addEventListener("click", fechar);
    return () => document.removeEventListener("click", fechar);
  }, []);

  const naoLidas = lista.filter((n) => !n.lidaEm).length;
  async function marcarTodas() {
    await chamarApi("/api/notificacoes", { corpo: {} });
    carregar();
  }

  return (
    <div className="relative" ref={caixa}>
      <button className="relative rounded-md p-1.5 text-slate-600 hover:bg-slate-100" onClick={() => setAberto(!aberto)} aria-label={`Notificações (${naoLidas} não lidas)`}>
        <Bell className="size-5" />
        {naoLidas > 0 && <span className="absolute -right-0.5 -top-0.5 rounded-full bg-pink-600 px-1.5 text-[10px] font-semibold text-white">{naoLidas}</span>}
      </button>
      {aberto && (
        <div className="absolute right-0 z-30 mt-2 w-96 max-w-[90vw] rounded-lg border border-slate-200 bg-superficie shadow-lg">
          <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2 text-sm">
            <strong>Notificações</strong>
            {naoLidas > 0 && (
              <button className="text-xs text-marca-600 hover:underline" onClick={marcarTodas}>
                Marcar todas como lidas
              </button>
            )}
          </div>
          <ul className="max-h-96 overflow-y-auto">
            {lista.length === 0 && <li className="px-3 py-6 text-center text-sm text-slate-500">Nenhuma notificação.</li>}
            {lista.map((n) => (
              <li key={n.id} className={`border-b border-slate-100 px-3 py-2 text-sm ${n.lidaEm ? "text-slate-500" : ""}`}>
                <div className="flex items-start justify-between gap-2">
                  <span className={`font-medium ${n.tipo === "transferencia" ? "text-rose-700" : n.tipo === "aceite" ? "text-emerald-700" : ""}`}>{n.titulo}</span>
                  <span className="shrink-0 text-xs text-slate-400">{dataHora(n.criadoEm)}</span>
                </div>
                <p className="mt-0.5 line-clamp-3 text-xs">{n.mensagem}</p>
                {n.leadId && (
                  <Link
                    href={n.tipo === "aceite" ? `/leads/${n.leadId}?contrato=1#contrato` : `/leads/${n.leadId}`}
                    className={`text-xs hover:underline ${n.tipo === "aceite" ? "font-semibold text-emerald-700" : "text-marca-600"}`}
                    onClick={() => setAberto(false)}
                  >
                    {n.tipo === "aceite" ? "Gerar contrato" : "Abrir lead"}
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export function MenuUsuario({ nome, papel }: { nome: string; papel: string }) {
  async function sair() {
    await chamarApi("/api/auth/sair", { corpo: {} }).catch(() => undefined);
    window.location.href = "/entrar";
  }
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="hidden text-slate-600 md:inline">
        {nome} <span className="text-xs text-slate-400">({papel})</span>
      </span>
      <button className="rounded-md p-1.5 text-slate-600 hover:bg-slate-100" onClick={sair} aria-label="Sair" title="Sair">
        <LogOut className="size-5" />
      </button>
    </div>
  );
}
