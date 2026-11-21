import Link from "next/link";
import { PainelMetricas } from "@/components/PainelMetricas";
import { AtualizarAoVivo } from "@/components/AoVivo";
import { Barra, Titulo, dataHora } from "@/components/ui";
import { listarBuscas } from "@/core/busca";
import { db } from "@/core/db";
import { modoWhatsApp } from "@/core/whatsapp/cliente";
import { provedorAtivo } from "@/core/ia/servico";
import { metricas } from "@/core/metricas";
import { STATUS_BUSCA_ROTULO } from "@/core/tipos";
import { exigirUsuario } from "@/lib/auth";

export default async function Dashboard() {
  await exigirUsuario("/");
  const [m, buscas, transferidos, ia, wa] = await Promise.all([
    metricas(),
    listarBuscas(8),
    db.lead.findMany({
      where: { etapa: { chave: "intervencao_humana" } },
      select: { id: true, nome: true, motivoTransferencia: true, transferidoEm: true },
      orderBy: { transferidoEm: "desc" },
      take: 8,
    }),
    provedorAtivo(),
    modoWhatsApp(),
  ]);

  return (
    <div className="space-y-6">
      <Titulo>Dashboard</Titulo>
      {(ia.nome === "mock" || wa === "mock") && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <strong>Modo simulado:</strong> {ia.nome === "mock" && "IA sem chave da Anthropic (análises e respostas simuladas). "}
          {wa === "mock" && "WhatsApp sem credenciais da Meta (nenhuma mensagem sai do computador). "}
          <Link href="/admin/integracoes" className="underline">Configurar integrações</Link>
        </div>
      )}
      <PainelMetricas inicial={m} />

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="cartao p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-medium">Pesquisas recentes</h2>
            <Link href="/pesquisas" className="text-sm text-marca-600 hover:underline">Ver todas</Link>
          </div>
          {buscas.length === 0 ? (
            <p className="text-sm text-slate-500">Nenhuma pesquisa ainda. <Link className="text-marca-600 hover:underline" href="/pesquisas">Comece uma</Link>.</p>
          ) : (
            <ul className="space-y-3">
              {buscas.map((b) => (
                <li key={b.id}>
                  <Link href={`/pesquisas/${b.id}`} className="block rounded-md p-2 hover:bg-slate-50">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium">{b.nicho} — {b.cidade}</span>
                      <span className="text-xs text-slate-500">{STATUS_BUSCA_ROTULO[b.status]}</span>
                    </div>
                    <div className="mt-1.5 flex items-center gap-3">
                      <Barra valor={b.progresso} />
                      <span className="shrink-0 text-xs tabular-nums text-slate-500">{b.encontradas} empresas · {b.qualificadas} qualif.</span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="cartao p-4">
          <h2 className="mb-3 font-medium">Aguardando sua intervenção</h2>
          {transferidos.length === 0 ? (
            <p className="text-sm text-slate-500">Nenhuma negociação aguardando você.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {transferidos.map((l) => (
                <li key={l.id} className="py-2 text-sm">
                  <Link href={`/leads/${l.id}`} className="font-medium text-marca-700 hover:underline">{l.nome}</Link>
                  <span className="ml-2 text-xs text-slate-400">{dataHora(l.transferidoEm)}</span>
                  <p className="text-xs text-slate-600">{l.motivoTransferencia}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
      <AtualizarAoVivo tipos={["busca.atualizada", "notificacao.nova", "lead.atualizado"]} />
    </div>
  );
}
