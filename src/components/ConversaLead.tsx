"use client";

// Histórico da conversa no WhatsApp + ações humanas (responder, assumir, devolver ao agente)
// e, no modo simulado, um campo para fazer o papel do cliente.

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Bot, FlaskConical, Hand, Send } from "lucide-react";
import { chamarApi } from "./api";
import { dataHora } from "./ui";

interface Mensagem {
  id: string;
  direcao: string;
  autor: string;
  conteudo: string;
  status: string;
  erro: string | null;
  criadoEm: string;
  tipo: string;
}

interface Conversa {
  id: string;
  status: string;
  agenteAtivo: boolean;
  telefone: string;
  janelaAberta: boolean;
  mensagens: Mensagem[];
}

const ROTULO_AUTOR: Record<string, string> = { cliente: "Cliente", agente: "Agente IA", humano: "Você", sistema: "Sistema" };
const ICONE_STATUS: Record<string, string> = { pendente: "…", enviada: "✓", entregue: "✓✓", lida: "✓✓ lida", falhou: "falhou", bloqueada: "bloqueada", recebida: "" };

export function ConversaLead({ leadId, conversa, simulador, podeSimularSemConversa }: { leadId: string; conversa: Conversa | null; simulador: boolean; podeSimularSemConversa: boolean }) {
  const router = useRouter();
  const [texto, setTexto] = useState("");
  const [simulado, setSimulado] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const fim = useRef<HTMLDivElement>(null);
  useEffect(() => fim.current?.scrollIntoView({ block: "nearest" }), [conversa?.mensagens.length]);

  async function rodar(fn: () => Promise<unknown>, limpar?: () => void) {
    setOcupado(true);
    setErro(null);
    try {
      await fn();
      limpar?.();
      router.refresh();
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setOcupado(false);
    }
  }

  const simular = (t: string) =>
    rodar(
      () => (conversa ? chamarApi(`/api/conversas/${conversa.id}/simular`, { corpo: { texto: t } }) : chamarApi("/api/simulador", { corpo: { leadId, texto: t } })),
      () => setSimulado(""),
    );

  return (
    <section className="cartao p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 className="font-medium">Conversa no WhatsApp</h2>
        {conversa && (
          <>
            <span className="text-xs text-slate-500">{conversa.telefone}</span>
            <span className={`selo ${conversa.agenteAtivo && conversa.status === "ativa" ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"}`}>
              {conversa.status === "encerrada" ? "Encerrada" : conversa.agenteAtivo && conversa.status === "ativa" ? "Agente ativo" : "Atendimento humano"}
            </span>
            <span className={`selo ${conversa.janelaAberta ? "bg-sky-100 text-sky-800" : "bg-slate-100 text-slate-600"}`} title="A Meta só permite texto livre até 24 h depois da última mensagem do cliente">
              {conversa.janelaAberta ? "Janela de 24 h aberta" : "Fora da janela de 24 h"}
            </span>
            <div className="ml-auto flex gap-2">
              {conversa.status !== "encerrada" &&
                (conversa.agenteAtivo && conversa.status === "ativa" ? (
                  <button className="botao-sec" disabled={ocupado} onClick={() => rodar(() => chamarApi(`/api/conversas/${conversa.id}/assumir`, { corpo: {} }))}>
                    <Hand className="size-4" /> Assumir atendimento
                  </button>
                ) : (
                  <button className="botao-sec" disabled={ocupado} onClick={() => rodar(() => chamarApi(`/api/conversas/${conversa.id}/reativar`, { corpo: {} }))} title="Autoriza o agente a voltar a responder este lead">
                    <Bot className="size-4" /> Devolver ao agente
                  </button>
                ))}
            </div>
          </>
        )}
      </div>

      {!conversa ? (
        <p className="text-sm text-slate-500">Nenhuma conversa ainda.</p>
      ) : (
        <div className="max-h-[480px] space-y-2 overflow-y-auto rounded-md bg-slate-50 p-3">
          {conversa.mensagens.map((m) => (
            <div key={m.id} className={`flex ${m.direcao === "entrada" ? "justify-start" : "justify-end"}`}>
              <div
                className={`max-w-[80%] rounded-lg px-3 py-2 text-sm shadow-sm ${
                  m.status === "bloqueada" ? "border border-dashed border-rose-300 bg-rose-50 text-rose-900" : m.direcao === "entrada" ? "bg-superficie" : m.autor === "agente" ? "bg-emerald-50" : "bg-marca-50"
                }`}
              >
                <div className="mb-0.5 text-[11px] font-medium text-slate-500">{ROTULO_AUTOR[m.autor] ?? m.autor}{m.tipo === "template" ? " · template" : ""}</div>
                <p className="whitespace-pre-wrap break-words">{m.conteudo}</p>
                <div className="mt-1 text-right text-[10px] text-slate-400">
                  {dataHora(m.criadoEm)} {ICONE_STATUS[m.status] ?? m.status}
                </div>
                {m.erro && <div className="mt-1 text-[11px] text-rose-700">{m.erro}</div>}
              </div>
            </div>
          ))}
          <div ref={fim} />
        </div>
      )}

      {conversa && conversa.status !== "encerrada" && (
        <form
          className="mt-3 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (texto.trim()) void rodar(() => chamarApi(`/api/conversas/${conversa.id}/mensagem`, { corpo: { texto } }), () => setTexto(""));
          }}
        >
          <input className="campo" value={texto} onChange={(e) => setTexto(e.target.value)} maxLength={4000} placeholder={conversa.janelaAberta ? "Responder como você (humano)…" : "Fora da janela de 24 h: só template"} disabled={!conversa.janelaAberta} aria-label="Mensagem" />
          <button className="botao" disabled={ocupado || !conversa.janelaAberta}><Send className="size-4" /> Enviar</button>
        </form>
      )}

      {simulador && (conversa || podeSimularSemConversa) && (
        <form
          className="mt-3 flex gap-2 rounded-md border border-dashed border-amber-300 bg-amber-50 p-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (simulado.trim()) void simular(simulado);
          }}
        >
          <FlaskConical className="mt-2 size-4 shrink-0 text-amber-700" />
          <input className="campo" value={simulado} onChange={(e) => setSimulado(e.target.value)} maxLength={4000} placeholder="Simulador: escreva como se fosse o cliente (passa pelo mesmo fluxo do webhook)" aria-label="Mensagem simulada do cliente" />
          <button className="botao-sec" disabled={ocupado}>Simular</button>
        </form>
      )}
      {erro && <p className="erro mt-2">{erro}</p>}
    </section>
  );
}
