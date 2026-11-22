import Link from "next/link";
import { AtualizarAoVivo } from "@/components/AoVivo";
import { IndicadoresPendencias } from "@/components/IndicadoresPendencias";
import { AprovarContatos, EnviosAgendados, MarcarCobrado } from "@/components/Pendencias";
import { Score, Titulo, dataHora } from "@/components/ui";
import { listarPendencias } from "@/core/pendencias";
import { exigirUsuario } from "@/lib/auth";

export default async function Pendencias() {
  await exigirUsuario("/pendencias");
  const p = await listarPendencias();

  return (
    <div className="space-y-6">
      <Titulo>Pendências</Titulo>
      <IndicadoresPendencias aprovar={p.aprovar.length} contratos={p.contratos.length} intervencao={p.intervencao.length} alertas={p.alertas.length} cobrar={p.cobrar.length} />

      {p.alertas.length > 0 && (
        <section id="alertas" className="cartao space-y-2 p-4">
          <h2 className="font-medium">Alertas do sistema</h2>
          <ul className="space-y-1 text-sm">
            {p.alertas.map((a) => (
              <li key={a.texto} className={a.nivel === "erro" ? "text-rose-700" : "text-amber-700"}>
                {a.texto} <Link href={a.href} className="ml-1 underline">Resolver</Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {p.cobrar.length > 0 && (
        <section id="cobrar" className="cartao border-2 border-teal-300 p-4">
          <h2 className="mb-2 font-medium text-teal-800">Contrato aceito: envie o link de pagamento</h2>
          <ul className="divide-y divide-slate-100">
            {p.cobrar.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-3 py-2 text-sm">
                <div className="min-w-0 flex-1">
                  <Link href={`/leads/${c.lead.id}`} className="font-medium text-marca-700 hover:underline">{c.lead.nome}</Link>
                  <span className="ml-2 text-xs text-slate-400">nº {c.numero} · aceito {dataHora(c.aceitoEm)}</span>
                  <p className="text-xs text-slate-600">{(c.lead.motivoTransferencia ?? "").replace("Contrato aceito: enviar link de pagamento. ", "")}</p>
                </div>
                <MarcarCobrado contratoId={c.id} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {p.contratos.length > 0 && (
        <section id="contratos" className="cartao border-2 border-emerald-300 p-4">
          <h2 className="mb-2 font-medium text-emerald-800">Aceitaram a proposta: gere o contrato</h2>
          <ul className="divide-y divide-slate-100">
            {p.contratos.map((l) => (
              <li key={l.id} className="flex items-center gap-3 py-2 text-sm">
                <Score valor={l.score} />
                <div className="min-w-0 flex-1">
                  <Link href={`/leads/${l.id}`} className="font-medium text-marca-700 hover:underline">{l.nome}</Link>
                  <span className="ml-2 text-xs text-slate-400">{dataHora(l.transferidoEm)}</span>
                  <p className="text-xs text-slate-600">{l.motivoTransferencia}</p>
                </div>
                <Link href={`/leads/${l.id}?contrato=1#contrato`} className="botao">Gerar contrato</Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section id="intervencao" className="cartao p-4">
        <h2 className="mb-2 font-medium">Negociações esperando você</h2>
        {p.intervencao.length === 0 ? (
          <p className="text-sm text-slate-500">Nenhuma. O agente avisa aqui quando o cliente pedir um humano, desconto ou algo que ele não sabe responder. Aceites vão para "Gerar contrato".</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {p.intervencao.map((l) => (
              <li key={l.id} className="flex items-center gap-3 py-2 text-sm">
                <Score valor={l.score} />
                <div className="min-w-0 flex-1">
                  <Link href={`/leads/${l.id}`} className="font-medium text-marca-700 hover:underline">{l.nome}</Link>
                  <span className="ml-2 text-xs text-slate-400">{dataHora(l.transferidoEm)}</span>
                  <p className="text-xs text-slate-600">{l.motivoTransferencia}</p>
                </div>
                <Link href={`/leads/${l.id}`} className="botao">Assumir conversa</Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section id="aprovar" className="cartao p-4">
        <h2 className="mb-2 font-medium">Aprovar primeiro contato</h2>
        <AprovarContatos leads={p.aprovar} etapaPerdidoId={p.etapaPerdidoId} />
      </section>

      <section id="agendados" className="cartao p-4">
        <h2 className="mb-2 font-medium">Envios agendados ({p.agendados.length})</h2>
        <EnviosAgendados itens={p.agendados.map((a) => ({ ...a, quando: a.quando.toISOString() }))} />
      </section>

      <AtualizarAoVivo tipos={["lead.atualizado", "notificacao.nova", "mensagem.status", "busca.atualizada"]} />
    </div>
  );
}
