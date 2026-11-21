"use client";

// Tempo real via SSE com UMA conexão por aba, compartilhada entre componentes.
// - EventSource reconecta sozinho e manda Last-Event-ID: o servidor reenvia o que foi perdido
// - eventos repetidos (mesmo id) são ignorados
// - ao reconectar, avisa os assinantes para recarregar o estado completo (snapshot)

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

type Ouvinte = (tipo: string, dados: Record<string, unknown>) => void;

const ouvintes = new Set<Ouvinte>();
const ouvintesEstado = new Set<() => void>();
let fonte: EventSource | null = null;
let ultimoId = 0;
let estado: "conectando" | "conectado" | "reconectando" = "conectando";
let jaConectou = false;

const TIPOS = ["busca.atualizada", "lead.atualizado", "lead.novo", "mensagem.nova", "mensagem.status", "notificacao.nova", "metricas"];

function mudarEstado(e: typeof estado) {
  estado = e;
  ouvintesEstado.forEach((f) => f());
}

function abrir() {
  if (fonte || typeof window === "undefined") return;
  fonte = new EventSource("/api/eventos");
  fonte.addEventListener("conectado", () => {
    const reconexao = jaConectou;
    jaConectou = true;
    mudarEstado("conectado");
    // Reconectou: recarrega o estado inteiro, além dos eventos reenviados.
    if (reconexao) ouvintes.forEach((o) => o("reconectado", {}));
  });
  for (const tipo of TIPOS) {
    fonte.addEventListener(tipo, (ev) => {
      const e = ev as MessageEvent<string>;
      const id = Number(e.lastEventId);
      if (id && id <= ultimoId) return; // duplicado
      if (id) ultimoId = id;
      let dados: Record<string, unknown> = {};
      try {
        dados = JSON.parse(e.data) as Record<string, unknown>;
      } catch {
        // ignora
      }
      ouvintes.forEach((o) => o(tipo, dados));
    });
  }
  fonte.onerror = () => mudarEstado("reconectando");
}

export function useEventos(fn: Ouvinte) {
  const ref = useRef(fn);
  useEffect(() => {
    ref.current = fn;
  });
  useEffect(() => {
    abrir();
    const o: Ouvinte = (t, d) => ref.current(t, d);
    ouvintes.add(o);
    return () => {
      ouvintes.delete(o);
    };
  }, []);
}

export function useEstadoConexao() {
  return useSyncExternalStore(
    (f) => {
      ouvintesEstado.add(f);
      return () => ouvintesEstado.delete(f);
    },
    () => estado,
    () => "conectando" as const,
  );
}

/** Recarrega os dados do servidor (router.refresh) quando chegam eventos relevantes. No máximo 1x/1,5 s. */
export function AtualizarAoVivo({ tipos, filtro }: { tipos: string[]; filtro?: Record<string, string> }) {
  const router = useRouter();
  const pendente = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEventos((tipo, dados) => {
    if (tipo !== "reconectado" && !tipos.includes(tipo)) return;
    if (filtro && tipo !== "reconectado" && !Object.entries(filtro).every(([k, v]) => dados[k] === undefined || dados[k] === v)) return;
    if (pendente.current) return;
    pendente.current = setTimeout(() => {
      pendente.current = null;
      router.refresh();
    }, 1500);
  });
  return null;
}

export function IndicadorConexao() {
  const e = useEstadoConexao();
  const [montado, setMontado] = useState(false);
  useEffect(() => setMontado(true), []);
  if (!montado) return null;
  const cor = e === "conectado" ? "bg-emerald-500" : e === "reconectando" ? "bg-amber-500 animate-pulse" : "bg-slate-300";
  const texto = e === "conectado" ? "Ao vivo" : e === "reconectando" ? "Reconectando…" : "Conectando…";
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-slate-500" title="Atualização em tempo real (SSE)">
      <span className={`size-2 rounded-full ${cor}`} /> {texto}
    </span>
  );
}
