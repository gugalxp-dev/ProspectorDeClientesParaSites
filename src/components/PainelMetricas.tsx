"use client";

// Indicadores do dashboard: começam com os dados do servidor e são recarregados a cada evento SSE.
// Em destaque, o funil comercial (o que vira dinheiro). Abaixo, em tamanho menor, os números de apoio.

import Link from "next/link";
import { useCallback, useRef, useState } from "react";
import { ChevronRight } from "lucide-react";
import type { Metricas } from "@/core/metricas";
import { chamarApi } from "./api";
import { useEventos } from "./AoVivo";
import { usd } from "./ui";

type Etapa = { chave: keyof Metricas; rotulo: string; dica: string; href: string; destaque?: string; taxa?: (m: Metricas) => string | null };

const FUNIL: Etapa[] = [
  { chave: "prontos", rotulo: "Prontos para contato", dica: "Qualificados, com telefone, ainda não chamados", href: "/pendencias#aprovar" },
  { chave: "contatados", rotulo: "Contatados", dica: "Conversas em que o primeiro contato já saiu", href: "/crm?buscaId=todas" },
  { chave: "conversasRespondidas", rotulo: "Responderam", dica: "Clientes que responderam", href: "/crm?buscaId=todas", taxa: (m) => (m.taxaResposta == null ? null : `${m.taxaResposta}% de resposta`) },
  { chave: "emNegociacao", rotulo: "Em negociação", dica: "Conversas avançadas com o agente", href: "/crm?buscaId=todas" },
  { chave: "fechados", rotulo: "Fechados", dica: "Negócios ganhos", href: "/crm?buscaId=todas", destaque: "text-emerald-600", taxa: (m) => (m.taxaConversao == null ? null : `${m.taxaConversao}% de conversão`) },
];

const APOIO: Array<[keyof Metricas, string]> = [
  ["empresas", "Empresas encontradas"],
  ["qualificadas", "Qualificadas"],
  ["descartados", "Ignoradas (rede, sem celular ou site bom)"],
  ["pesquisasAtivas", "Pesquisas rodando"],
  ["entregues", "Mensagens entregues"],
  ["lidas", "Mensagens lidas"],
];

export function PainelMetricas({ inicial }: { inicial: Metricas }) {
  const [m, setM] = useState(inicial);
  const agendado = useRef(false);
  const recarregar = useCallback(() => {
    if (agendado.current) return;
    agendado.current = true;
    setTimeout(() => {
      agendado.current = false;
      chamarApi<Metricas>("/api/metricas").then(setM).catch(() => undefined);
    }, 1000);
  }, []);
  useEventos(recarregar);

  return (
    <div className="space-y-4">
      <section>
        <h2 className="mb-2 text-sm font-medium text-slate-500">Funil comercial</h2>
        <div className="flex flex-col gap-2 lg:flex-row lg:items-stretch">
          {FUNIL.map((e, i) => (
            <div key={e.chave} className="flex flex-1 items-center gap-2">
              <Link href={e.href} title={e.dica} className="cartao flex-1 p-4 transition hover:shadow-md">
                <div className="text-xs font-medium text-slate-500">{e.rotulo}</div>
                <div className={`text-4xl font-bold tabular-nums ${e.destaque ?? "text-slate-900"}`}>{Number(m[e.chave]).toLocaleString("pt-BR")}</div>
                <div className="h-4 text-xs text-slate-500">{e.taxa?.(m) ?? ""}</div>
              </Link>
              {i < FUNIL.length - 1 && <ChevronRight className="hidden size-5 shrink-0 text-slate-300 lg:block" />}
            </div>
          ))}
        </div>
      </section>

      <section className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-slate-600">
        {APOIO.map(([chave, rotulo]) => (
          <span key={chave}>
            <strong className="tabular-nums text-slate-900">{Number(m[chave]).toLocaleString("pt-BR")}</strong> {rotulo}
          </span>
        ))}
        {m.falhas > 0 && (
          <Link href="/pendencias#alertas" className="text-amber-700 hover:underline">
            <strong className="tabular-nums">{m.falhas}</strong> falhas
          </Link>
        )}
        <span className="ml-auto text-xs text-slate-500">
          Custo estimado: hoje {usd(m.custoHojeUsd)} · mês {usd(m.custoMesUsd)}
        </span>
      </section>
    </div>
  );
}
