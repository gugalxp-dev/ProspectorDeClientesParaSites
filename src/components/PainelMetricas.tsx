"use client";

// Indicadores do dashboard: começam com os dados do servidor e são recarregados a cada evento SSE.

import { useCallback, useRef, useState } from "react";
import type { Metricas } from "@/core/metricas";
import { chamarApi } from "./api";
import { useEventos } from "./AoVivo";
import { usd } from "./ui";

const GRUPOS: Array<{ titulo: string; itens: Array<[keyof Metricas, string, string?]> }> = [
  {
    titulo: "Prospecção",
    itens: [
      ["pesquisasAtivas", "Pesquisas ativas"],
      ["empresas", "Empresas encontradas"],
      ["analisadas", "Empresas analisadas"],
      ["qualificadas", "Qualificadas"],
      ["semSite", "Sem site identificado", "Inclui só rede social"],
      ["siteDeficiente", "Site deficiente ou fora do ar"],
    ],
  },
  {
    titulo: "Contato e negociação",
    itens: [
      ["autorizados", "Contatos autorizados"],
      ["enviadas", "Mensagens enviadas"],
      ["entregues", "Mensagens entregues"],
      ["conversasRespondidas", "Conversas respondidas"],
      ["emNegociacao", "Em negociação"],
      ["aguardandoHumano", "Aguardando intervenção"],
      ["fechados", "Negócios fechados"],
      ["falhas", "Falhas de processamento"],
    ],
  },
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
      {GRUPOS.map((g) => (
        <section key={g.titulo}>
          <h2 className="mb-2 text-sm font-medium text-slate-500">{g.titulo}</h2>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-8">
            {g.itens.map(([chave, rotulo, dica]) => (
              <div key={chave} className={`cartao px-3 py-2 ${chave === "aguardandoHumano" && Number(m[chave]) > 0 ? "border-rose-300 bg-rose-50" : ""} ${chave === "falhas" && Number(m[chave]) > 0 ? "border-amber-300" : ""}`} title={dica}>
                <div className="truncate text-[11px] text-slate-500 sm:text-xs">{rotulo}</div>
                <div className="text-xl font-semibold tabular-nums">{Number(m[chave]).toLocaleString("pt-BR")}</div>
              </div>
            ))}
          </div>
        </section>
      ))}
      <p className="text-xs text-slate-500">
        Custo estimado: hoje {usd(m.custoHojeUsd)} · mês {usd(m.custoMesUsd)} · atualizado {new Date(m.geradoEm).toLocaleTimeString("pt-BR")}
      </p>
    </div>
  );
}
