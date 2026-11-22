"use client";

// Contrato do lead: preencher os dados essenciais -> ver a prévia -> finalizar (congela + cria link) -> enviar pelo WhatsApp.

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Copy, Eye, FileSignature, Send, X } from "lucide-react";
import { chamarApi } from "./api";
import { FolhaContrato, type CabecalhoContrato } from "./TextoContrato";
import { dataHora } from "./ui";

interface Dados {
  contratanteNome: string;
  contratanteDocumento: string;
  contratanteEndereco: string;
  contratanteEmail: string;
  contratanteTelefone: string;
  servico: string;
  descricaoServico: string;
  valorCentavos: number;
  formaPagamento: string;
  prazoDias: number;
  observacoes: string;
}

interface ContratoResumo {
  id: string;
  numero: string;
  status: string;
  link: string | null;
  enviadoEm: string | null;
  visualizadoEm: string | null;
  aceitoEm: string | null;
  aceiteNome: string | null;
  criadoEm: string;
}

interface Servico {
  nome: string;
  descricao: string;
  precoCentavos: number;
  prazoDias: number;
}

const STATUS: Record<string, [string, string]> = {
  rascunho: ["Rascunho", "bg-slate-100 text-slate-700"],
  pronto: ["Pronto (não enviado)", "bg-sky-100 text-sky-800"],
  enviado: ["Enviado", "bg-violet-100 text-violet-800"],
  visualizado: ["Cliente abriu", "bg-amber-100 text-amber-800"],
  aceito: ["Aceito", "bg-emerald-100 text-emerald-800"],
  cancelado: ["Cancelado", "bg-zinc-200 text-zinc-600"],
};

export function ContratoLead(p: { leadId: string; contratos: ContratoResumo[]; rascunho: Dados; rascunhoId: string | null; servicos: Servico[]; temWhatsapp: boolean; abrir?: boolean; logo?: string; empresa?: string }) {
  const router = useRouter();
  const [dados, setDados] = useState<Dados>(p.rascunho);
  const ativoInicial = p.contratos.some((c) => c.status !== "cancelado" && c.status !== "rascunho");
  // Veio de "Gerar contrato" (Pendências ou notificação): já abre o formulário preenchido.
  const [editando, setEditando] = useState(!!p.rascunhoId || (!!p.abrir && !ativoInicial));
  const [previa, setPrevia] = useState<{ id: string; numero: string; texto: string; pendencias: string[] } | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const ativo = p.contratos.find((c) => c.status !== "cancelado" && c.status !== "rascunho");
  const campo = <K extends keyof Dados>(k: K, v: Dados[K]) => setDados((d) => ({ ...d, [k]: v }));

  async function rodar(fn: () => Promise<void>) {
    setOcupado(true);
    setErro(null);
    setAviso(null);
    try {
      await fn();
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setOcupado(false);
    }
  }

  const verPrevia = () =>
    rodar(async () => {
      const r = await chamarApi<{ id: string; numero: string; previa: string; pendencias: string[] }>("/api/contratos", { corpo: { leadId: p.leadId, dados } });
      setPrevia({ id: r.id, numero: r.numero, texto: r.previa, pendencias: r.pendencias });
    });

  const finalizarEEnviar = (id: string) =>
    rodar(async () => {
      const r = await chamarApi<{ link: string }>(`/api/contratos/${id}/finalizar`, { corpo: {} });
      if (p.temWhatsapp) {
        try {
          await chamarApi(`/api/contratos/${id}/enviar`, { corpo: {} });
          setAviso("Contrato enviado pelo WhatsApp.");
        } catch (e) {
          setAviso(`Contrato pronto, mas o WhatsApp não enviou (${(e as Error).message}). Copie o link: ${r.link}`);
        }
      } else {
        setAviso(`Contrato pronto. O lead não tem WhatsApp: copie o link e envie por outro canal.`);
      }
      setPrevia(null);
      setEditando(false);
      router.refresh();
    });

  const acao = (id: string, a: "enviar" | "cancelar", ok: string) =>
    rodar(async () => {
      await chamarApi(`/api/contratos/${id}/${a}`, { corpo: {} });
      setAviso(ok);
      router.refresh();
    });

  return (
    <section id="contrato" className={`cartao scroll-mt-24 space-y-3 p-4 text-sm ${p.abrir && !ativoInicial ? "ring-2 ring-emerald-400" : ""}`}>
      <div className="flex items-center gap-2">
        <FileSignature className="size-4 text-marca-600" />
        <h2 className="font-medium">Contrato</h2>
        {!editando && !ativo && (
          <button className="botao ml-auto" onClick={() => setEditando(true)}>Gerar contrato</button>
        )}
      </div>

      {p.contratos.filter((c) => c.status !== "rascunho").map((c) => (
        <div key={c.id} className="space-y-1 rounded-md border border-slate-200 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <strong>nº {c.numero}</strong>
            <span className={`selo ${STATUS[c.status]?.[1] ?? ""}`}>{STATUS[c.status]?.[0] ?? c.status}</span>
            <span className="ml-auto text-xs text-slate-400">{dataHora(c.criadoEm)}</span>
          </div>
          <div className="text-xs text-slate-500">
            {c.enviadoEm && <>Enviado {dataHora(c.enviadoEm)} · </>}
            {c.visualizadoEm && <>Aberto pelo cliente {dataHora(c.visualizadoEm)} · </>}
            {c.aceitoEm && <span className="text-emerald-700">Aceito por {c.aceiteNome} em {dataHora(c.aceitoEm)}</span>}
          </div>
          {c.link && c.status !== "cancelado" && (
            <div className="flex flex-wrap gap-2 pt-1">
              <a href={c.link} target="_blank" rel="noopener noreferrer" className="botao-sec"><Eye className="size-4" /> Abrir página do cliente</a>
              <button className="botao-sec" onClick={() => navigator.clipboard.writeText(c.link!).then(() => setAviso("Link copiado."))}><Copy className="size-4" /> Copiar link</button>
              {c.status !== "aceito" && p.temWhatsapp && (
                <button className="botao-sec" disabled={ocupado} onClick={() => acao(c.id, "enviar", "Link reenviado pelo WhatsApp.")}><Send className="size-4" /> {c.enviadoEm ? "Reenviar" : "Enviar"} pelo WhatsApp</button>
              )}
              {c.status !== "aceito" && (
                <button className="botao-perigo" disabled={ocupado} onClick={() => acao(c.id, "cancelar", "Contrato cancelado. Gere um novo se precisar mudar algo.")}><X className="size-4" /> Cancelar</button>
              )}
            </div>
          )}
        </div>
      ))}

      {editando && !previa && (
        <div className="space-y-2 rounded-md bg-slate-50 p-3">
          <p className="text-xs text-slate-500">Só os dados essenciais. O texto vem do modelo único em Admin &gt; Contrato.</p>
          {p.servicos.length > 0 && (
            <select
              className="campo"
              aria-label="Serviço cadastrado"
              value=""
              onChange={(e) => {
                const s = p.servicos[Number(e.target.value)];
                if (s) setDados((d) => ({ ...d, servico: s.nome, descricaoServico: s.descricao, valorCentavos: s.precoCentavos, prazoDias: s.prazoDias }));
              }}
            >
              <option value="">Preencher com um serviço cadastrado...</option>
              {p.servicos.map((s, i) => (
                <option key={s.nome} value={i}>{s.nome}</option>
              ))}
            </select>
          )}
          <div className="grid gap-2 sm:grid-cols-2">
            <Campo rotulo="Contratante (razão social ou nome) *" valor={dados.contratanteNome} mudar={(v) => campo("contratanteNome", v)} />
            <Campo rotulo="CPF ou CNPJ *" valor={dados.contratanteDocumento} mudar={(v) => campo("contratanteDocumento", v)} />
            <Campo rotulo="Endereço" valor={dados.contratanteEndereco} mudar={(v) => campo("contratanteEndereco", v)} classe="sm:col-span-2" />
            <Campo rotulo="E-mail" valor={dados.contratanteEmail} mudar={(v) => campo("contratanteEmail", v)} />
            <Campo rotulo="Telefone" valor={dados.contratanteTelefone} mudar={(v) => campo("contratanteTelefone", v)} />
            <Campo rotulo="Serviço *" valor={dados.servico} mudar={(v) => campo("servico", v)} classe="sm:col-span-2" />
            <div className="sm:col-span-2">
              <label className="rotulo">Descrição do serviço</label>
              <textarea className="campo" rows={3} value={dados.descricaoServico} onChange={(e) => campo("descricaoServico", e.target.value)} />
            </div>
            <div>
              <label className="rotulo">Valor (R$) *</label>
              <input className="campo" type="number" min={0} step="0.01" value={dados.valorCentavos ? dados.valorCentavos / 100 : ""} onChange={(e) => campo("valorCentavos", Math.round(Number(e.target.value) * 100))} />
            </div>
            <div>
              <label className="rotulo">Prazo de entrega (dias) *</label>
              <input className="campo" type="number" min={1} max={365} value={dados.prazoDias} onChange={(e) => campo("prazoDias", Number(e.target.value) || 1)} />
            </div>
            <Campo rotulo="Forma de pagamento" valor={dados.formaPagamento} mudar={(v) => campo("formaPagamento", v)} classe="sm:col-span-2" />
            <div className="sm:col-span-2">
              <label className="rotulo">Observações (opcional)</label>
              <textarea className="campo" rows={2} value={dados.observacoes} onChange={(e) => campo("observacoes", e.target.value)} />
            </div>
          </div>
          <div className="flex gap-2">
            <button className="botao" disabled={ocupado} onClick={verPrevia}><Eye className="size-4" /> Ver prévia</button>
            <button className="botao-sec" onClick={() => setEditando(false)}>Fechar</button>
          </div>
        </div>
      )}

      {previa && (
        <PreviaTelaCheia
          previa={previa}
          cabecalho={{ logo: p.logo, empresa: p.empresa, numero: previa.numero }}
          ocupado={ocupado}
          erro={erro}
          temWhatsapp={p.temWhatsapp}
          aoFinalizar={() => finalizarEEnviar(previa.id)}
          aoVoltar={() => setPrevia(null)}
        />
      )}

      {aviso && <p className="break-all text-xs text-emerald-700">{aviso}</p>}
      {erro && <p className="erro">{erro}</p>}
    </section>
  );
}

/**
 * Prévia do contrato em tela cheia, sobre a página: o documento inteiro, exatamente como o cliente vai ver.
 * Vai direto no <body> (fora da coluna estreita do lead). Esc volta para a edição.
 */
function PreviaTelaCheia(p: {
  previa: { texto: string; pendencias: string[] };
  cabecalho: CabecalhoContrato;
  ocupado: boolean;
  erro: string | null;
  temWhatsapp: boolean;
  aoFinalizar: () => void;
  aoVoltar: () => void;
}) {
  const [montado, setMontado] = useState(false);
  const atual = useRef(p);
  atual.current = p;
  useEffect(() => {
    setMontado(true);
    const fechar = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !atual.current.ocupado) atual.current.aoVoltar();
    };
    document.addEventListener("keydown", fechar);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden"; // só a prévia rola
    return () => {
      document.removeEventListener("keydown", fechar);
      document.body.style.overflow = overflow;
    };
  }, []);
  if (!montado) return null;

  const bloqueado = p.previa.pendencias.length > 0;
  return createPortal(
    <div role="dialog" aria-modal="true" aria-label="Prévia do contrato" className="fixed inset-0 z-50 overflow-y-auto bg-[#0b0d17]/80 backdrop-blur-sm">
      <div className="sticky top-0 z-10 border-b border-white/10 bg-[#11142a]/95 px-4 py-3 text-sm text-[#f3f4fb] shadow-lg">
        <div className="mx-auto flex max-w-[820px] flex-wrap items-center gap-3">
          <div className="min-w-0 flex-1">
            <div className="font-semibold">Prévia do contrato</div>
            <div className="text-xs text-[#aab0cc]">É exatamente o que o cliente vai ver. Ao finalizar, o texto fica congelado.</div>
          </div>
          <button className="botao-sec" disabled={p.ocupado} onClick={p.aoVoltar}>Voltar e editar</button>
          <button className="botao" disabled={p.ocupado || bloqueado} onClick={p.aoFinalizar}>
            <Send className="size-4" /> {p.ocupado ? "Enviando..." : p.temWhatsapp ? "Finalizar e enviar pelo WhatsApp" : "Finalizar e gerar link"}
          </button>
        </div>
        {(bloqueado || p.erro) && (
          <div className="mx-auto mt-2 max-w-[820px] rounded-md bg-[#7f1d1d] px-3 py-2 text-xs text-[#fee2e2]">
            {bloqueado ? `Falta preencher: ${p.previa.pendencias.join(", ")}.` : p.erro}
          </div>
        )}
      </div>
      <div className="px-3 py-8 sm:px-6">
        <FolhaContrato texto={p.previa.texto} cabecalho={p.cabecalho} />
      </div>
    </div>,
    document.body,
  );
}

function Campo({ rotulo, valor, mudar, classe }: { rotulo: string; valor: string; mudar: (v: string) => void; classe?: string }) {
  return (
    <div className={classe}>
      <label className="rotulo">{rotulo}</label>
      <input className="campo" value={valor} onChange={(e) => mudar(e.target.value)} />
    </div>
  );
}
