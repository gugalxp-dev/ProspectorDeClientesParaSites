import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { AtualizarAoVivo } from "@/components/AoVivo";
import { AutorizacaoContato, ExcluirDados, Reprocessar } from "@/components/AcoesLead";
import { headers } from "next/headers";
import { ContratoLead } from "@/components/ContratoLead";
import { ConversaLead } from "@/components/ConversaLead";
import { NotasLead } from "@/components/NotasLead";
import { Score, SeloContato, SeloPresenca, SeloQualificacao, COR_ETAPA, dataHora, usd } from "@/components/ui";
import { dadosIniciais, esquemaDadosContrato, linkPublico } from "@/core/contratos";
import { obterConfig } from "@/core/config";
import { obterLeadCompleto } from "@/core/crm/leads";
import { db } from "@/core/db";
import type { AvaliacaoSite } from "@/core/prospeccao/avaliacaoSite";
import type { Qualificacao } from "@/core/prospeccao/qualificacao";
import { modoWhatsApp } from "@/core/whatsapp/cliente";
import { dentroDaJanela } from "@/core/whatsapp/conversas";
import { exigirUsuario } from "@/lib/auth";

const ROTULO_CAMPO: Record<string, string> = {
  nome: "Nome", telefone: "Telefone", whatsapp: "WhatsApp", email: "E-mail", website: "Site", endereco: "Endereço",
  instagram: "Instagram", facebook: "Facebook", linkedin: "LinkedIn", categoria: "Categoria", tiktok: "TikTok", site_possivel: "Possível site (não confirmado)", youtube: "YouTube", twitter: "X/Twitter",
};

function Linha({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-3 gap-2 border-b border-slate-100 py-1.5 text-sm last:border-0">
      <dt className="text-slate-500">{rotulo}</dt>
      <dd className="col-span-2 break-words">{children || <span className="text-slate-400">Não encontrado</span>}</dd>
    </div>
  );
}

function LinkExterno({ href, children }: { href: string; children?: React.ReactNode }) {
  // Só http(s): nada de javascript: vindo de dado coletado.
  if (!/^https?:\/\//i.test(href)) return <span>{href}</span>;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1 text-marca-700 hover:underline">
      {children ?? href.replace(/^https?:\/\/(www\.)?/, "")} <ExternalLink className="size-3" />
    </a>
  );
}

export default async function Lead({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { id } = await params;
  const abrirContrato = (await searchParams).contrato === "1";
  const u = await exigirUsuario(`/leads/${id}`);
  const l = await obterLeadCompleto(id);
  if (!l) notFound();
  const [usuarios, modo, contratos, servicos, h, cfgContrato, cfgAgente] = await Promise.all([
    db.usuario.findMany({ select: { id: true, nome: true }, where: { bloqueadoEm: null } }),
    modoWhatsApp(),
    db.contrato.findMany({ where: { leadId: id }, orderBy: { criadoEm: "desc" } }),
    db.servico.findMany({ where: { ativo: true }, orderBy: { ordem: "asc" }, select: { nome: true, descricao: true, precoCentavos: true, prazoDias: true } }),
    headers(),
    obterConfig("contrato"),
    obterConfig("agente"),
  ]);
  const origem = `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host") ?? "localhost:3000"}`;
  const rascunho = contratos.find((c) => c.status === "rascunho");
  const dadosRascunho = rascunho ? esquemaDadosContrato.parse(JSON.parse(rascunho.dados)) : await dadosIniciais(id);

  const q = l.qualificacao ? (JSON.parse(l.qualificacao) as Qualificacao) : null;
  const site = l.siteAvaliacao ? (JSON.parse(l.siteAvaliacao) as AvaliacaoSite) : null;
  const outras = l.outrasRedes ? (JSON.parse(l.outrasRedes) as Record<string, string>) : {};
  const objecoes = l.conversa?.objecoes ? (JSON.parse(l.conversa.objecoes) as string[]) : [];
  const fontesPorCampo = l.dados.reduce<Record<string, typeof l.dados>>((acc, d) => ((acc[d.campo] ??= []).push(d), acc), {});
  const transferencias = l.interacoes.filter((i) => i.tipo === "transferencia");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start gap-3">
        <Score valor={l.score ?? l.pontuacaoRegra} />
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-semibold">{l.nome}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-600">
            {l.etapa && (
              <span className="inline-flex items-center gap-1.5">
                <span className={`size-2.5 rounded-full ${COR_ETAPA[l.etapa.cor] ?? "bg-slate-400"}`} /> {l.etapa.nome}
              </span>
            )}
            <SeloPresenca presenca={l.presenca} confianca={l.presencaConfianca} />
            <SeloQualificacao status={l.qualificacaoStatus} />
            <SeloContato status={l.contatoStatus} />
            {l.automacaoPausada && <span className="selo bg-rose-100 text-rose-800">Automação pausada</span>}
          </div>
        </div>
        <div className="flex gap-2">
          <Reprocessar id={l.id} />
          <Link href={`/crm`} className="botao-sec">Voltar ao CRM</Link>
        </div>
      </div>

      {l.motivoTransferencia && l.automacaoPausada && (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
          <strong>Aguardando você:</strong> {l.motivoTransferencia} <span className="text-xs text-rose-700">({dataHora(l.transferidoEm)})</span>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <section className="cartao p-4">
            <h2 className="mb-2 font-medium">Dados coletados</h2>
            <dl>
              <Linha rotulo="Segmento / categoria">{[l.segmento, l.categoria].filter(Boolean).join(" · ")}</Linha>
              <Linha rotulo="Endereço">{[l.endereco, l.cidade, l.uf].filter(Boolean).join(", ")}</Linha>
              <Linha rotulo="Telefone">{l.telefone ?? l.telefoneE164}{l.ehCelular ? " (celular)" : ""}</Linha>
              <Linha rotulo="WhatsApp identificado">{l.whatsappE164}</Linha>
              <Linha rotulo="E-mail">{l.emails}</Linha>
              <Linha rotulo="Site">{l.website && <LinkExterno href={l.website} />}</Linha>
              <Linha rotulo="Instagram">{l.instagram && <LinkExterno href={l.instagram} />}</Linha>
              <Linha rotulo="Facebook">{l.facebook && <LinkExterno href={l.facebook} />}</Linha>
              <Linha rotulo="LinkedIn">{l.linkedin && <LinkExterno href={l.linkedin} />}</Linha>
              {Object.entries(outras).map(([rede, url]) => (
                <Linha key={rede} rotulo={ROTULO_CAMPO[rede] ?? rede}><LinkExterno href={url} /></Linha>
              ))}
              <Linha rotulo="Descoberto / atualizado">{`${dataHora(l.criadoEm)} · ${dataHora(l.atualizadoEm)}`}</Linha>
            </dl>
          </section>

          <section className="cartao p-4">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="font-medium">Análise da IA</h2>
              {q && <span className={`selo ${q.simulado ? "bg-amber-100 text-amber-800" : "bg-sky-100 text-sky-800"}`}>{q.simulado ? "Simulada (sem chave de IA)" : `${q.provedor} · ${q.modelo}`}</span>}
            </div>
            {!q ? (
              <p className="text-sm text-slate-500">{l.qualificacaoStatus === "erro" ? "A análise falhou. Use “Reprocessar” para tentar de novo." : "Ainda não analisado."}</p>
            ) : (
              <div className="space-y-3 text-sm">
                <p>
                  Score final <strong>{q.score}</strong> = regras {q.scoreRegra} e IA {q.scoreIa} · confiança <strong>{q.confianca}</strong>
                </p>
                <p className="text-slate-700">{q.justificativa}</p>
                <div className="grid gap-3 md:grid-cols-2">
                  <div>
                    <h3 className="mb-1 text-xs font-medium uppercase text-slate-500">Problemas identificados</h3>
                    <ItensIA itens={q.problemas} />
                  </div>
                  <div>
                    <h3 className="mb-1 text-xs font-medium uppercase text-slate-500">Oportunidades</h3>
                    <ItensIA itens={q.oportunidades} />
                  </div>
                </div>
                <details className="text-xs text-slate-600">
                  <summary className="cursor-pointer">Pontuação por regras ({q.scoreRegra})</summary>
                  <ul className="mt-1 list-disc pl-5">
                    {q.regra.map((r) => (
                      <li key={r.motivo}>{r.motivo}: {r.pontos >= 0 ? "+" : ""}{r.pontos}</li>
                    ))}
                  </ul>
                </details>
              </div>
            )}
          </section>

          {site && (
            <section className="cartao p-4">
              <h2 className="mb-2 font-medium">Avaliação técnica do site</h2>
              <p className="mb-2 text-xs text-slate-500">
                {site.paginasVisitadas} página(s) visitada(s) em {dataHora(site.avaliadoEm)}{site.bloqueadoPorRobots ? " · robots.txt não permite ler o conteúdo" : ""}
              </p>
              <ul className="grid gap-1 text-sm md:grid-cols-2">
                {site.verificacoes.map((v) => (
                  <li key={v.id} className="flex gap-2">
                    <span className={v.ok === true ? "text-emerald-600" : v.ok === false ? "text-rose-600" : "text-slate-400"}>{v.ok === true ? "✓" : v.ok === false ? "✗" : "?"}</span>
                    <span>
                      {v.rotulo}
                      {v.detalhe && <span className="block text-xs text-slate-500">{v.detalhe}</span>}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <ConversaLead
            leadId={l.id}
            conversa={
              l.conversa
                ? {
                    id: l.conversa.id,
                    status: l.conversa.status,
                    agenteAtivo: l.conversa.agenteAtivo,
                    telefone: l.conversa.telefoneE164,
                    janelaAberta: dentroDaJanela(l.conversa.ultimaEntradaEm),
                    mensagens: l.conversa.mensagens.map((m) => ({ id: m.id, direcao: m.direcao, autor: m.autor, conteudo: m.conteudo, status: m.status, erro: m.erro, criadoEm: m.criadoEm.toISOString(), tipo: m.tipo })),
                  }
                : null
            }
            simulador={modo === "mock"}
            podeSimularSemConversa={!!(l.whatsappE164 || (l.ehCelular && l.telefoneE164)) && !l.naoContatar}
          />
        </div>

        <div className="space-y-4">
          <section className="cartao p-4 text-sm">
            <h2 className="mb-2 font-medium">Negociação</h2>
            <Linha rotulo="Etapa no CRM">{l.etapa?.nome}</Linha>
            <Linha rotulo="Etapa da conversa">{l.conversa?.etapaNegociacao}</Linha>
            <Linha rotulo="Objeções">{objecoes.length ? <ul className="list-disc pl-4">{objecoes.map((o, i) => <li key={i}>{o}</li>)}</ul> : null}</Linha>
            <Linha rotulo="Transferências">
              {transferencias.length ? (
                <ul className="space-y-1">
                  {transferencias.map((t) => (
                    <li key={t.id}>{t.descricao} <span className="text-xs text-slate-400">{dataHora(t.criadoEm)}</span></li>
                  ))}
                </ul>
              ) : null}
            </Linha>
            <Linha rotulo="Custo estimado">{usd(l.custoUsd)}</Linha>
          </section>

          <ContratoLead
            leadId={l.id}
            contratos={contratos.map((c) => ({
              id: c.id,
              numero: c.numero,
              status: c.status,
              link: linkPublico(c.tokenCifrado, origem),
              enviadoEm: c.enviadoEm?.toISOString() ?? null,
              visualizadoEm: c.visualizadoEm?.toISOString() ?? null,
              aceitoEm: c.aceitoEm?.toISOString() ?? null,
              aceiteNome: c.aceiteNome,
              criadoEm: c.criadoEm.toISOString(),
            }))}
            rascunho={dadosRascunho}
            rascunhoId={rascunho?.id ?? null}
            abrir={abrirContrato}
            logo={cfgContrato.logo}
            empresa={(cfgAgente.nomeEmpresa || cfgContrato.contratadaNome).trim()}
            servicos={servicos}
            temWhatsapp={!!(l.whatsappE164 || (l.ehCelular && l.telefoneE164)) && !l.naoContatar}
          />

          <AutorizacaoContato
            id={l.id}
            contatoStatus={l.contatoStatus}
            telefone={l.whatsappE164 ?? (l.ehCelular ? l.telefoneE164 : null)}
            temConversa={!!l.conversa}
            consentimentos={l.consentimentos.map((c) => ({ id: c.id, tipo: c.tipo, origem: c.origem, baseLegal: c.baseLegal, registradoPor: c.registradoPor, criadoEm: c.criadoEm.toISOString() }))}
          />

          <NotasLead id={l.id} notas={l.notas} responsavelId={l.responsavelId} usuarios={usuarios} />

          <section className="cartao p-4">
            <h2 className="mb-2 font-medium">Fontes das informações</h2>
            {l.origens.length > 0 && (
              <p className="mb-2 text-xs text-slate-500">
                Encontrado em: {l.origens.map((o) => (o.url ? <LinkExterno key={o.id} href={o.url}>{o.fonte}</LinkExterno> : o.fonte)).reduce<React.ReactNode[]>((a, b, i) => (i ? [...a, ", ", b] : [b]), [])}
              </p>
            )}
            <ul className="space-y-2 text-xs">
              {Object.entries(fontesPorCampo).map(([campo, itens]) => (
                <li key={campo}>
                  <strong>{ROTULO_CAMPO[campo] ?? campo}</strong>
                  <ul className="ml-3">
                    {itens.map((d) => (
                      <li key={d.id} className="break-all text-slate-600">
                        {d.valor} <span className="text-slate-400">— {d.fonte}{d.url && /^https?:/.test(d.url) ? <> (<a className="underline" href={d.url} target="_blank" rel="noopener noreferrer nofollow">página</a>)</> : null}, {dataHora(d.coletadoEm)}</span>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          </section>

          <section className="cartao p-4">
            <h2 className="mb-2 font-medium">Histórico de interações</h2>
            <ul className="space-y-1.5 text-xs">
              {l.interacoes.map((i) => (
                <li key={i.id}>
                  <span className="text-slate-400">{dataHora(i.criadoEm)}</span> <span className="text-slate-700">{i.descricao}</span>
                </li>
              ))}
              {!l.interacoes.length && <li className="text-slate-500">Sem interações.</li>}
            </ul>
          </section>

          <section className="cartao p-4 text-xs">
            <h2 className="mb-2 text-sm font-medium">Pesquisas que encontraram</h2>
            <ul className="space-y-1">
              {l.buscas.map((b) => (
                <li key={b.buscaId}>
                  <Link href={`/pesquisas/${b.buscaId}`} className="text-marca-700 hover:underline">{b.busca.nicho} — {b.busca.cidade}</Link> <span className="text-slate-400">{dataHora(b.busca.criadoEm)}</span>
                </li>
              ))}
            </ul>
          </section>

          {u.papel === "admin" && <ExcluirDados id={l.id} nome={l.nome} />}
        </div>
      </div>
      <AtualizarAoVivo tipos={["lead.atualizado", "mensagem.nova", "mensagem.status"]} filtro={{ id: l.id }} />
      <AtualizarAoVivo tipos={["mensagem.nova", "mensagem.status"]} filtro={{ leadId: l.id }} />
    </div>
  );
}

function ItensIA({ itens }: { itens: Qualificacao["problemas"] }) {
  if (!itens.length) return <p className="text-xs text-slate-500">Nenhum.</p>;
  return (
    <ul className="space-y-1.5">
      {itens.map((p, i) => (
        <li key={i} className="text-sm">
          <span className={`selo mr-1 ${p.tipo === "fato" ? "bg-slate-200 text-slate-900" : "bg-violet-100 text-violet-800"}`}>{p.tipo === "fato" ? "Fato" : "Hipótese"}</span>
          {p.descricao}
          {p.evidencia && <span className="block text-xs text-slate-500">Evidência: {p.evidencia}</span>}
        </li>
      ))}
    </ul>
  );
}
