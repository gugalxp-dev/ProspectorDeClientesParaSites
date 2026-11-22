import Link from "next/link";
import { ConexaoBaileys } from "@/components/admin/ConexaoBaileys";
import { TestarIntegracao } from "@/components/admin/Integracoes";
import { FormConfig } from "@/components/admin/FormConfig";
import { Titulo, dataHora } from "@/components/ui";
import { obterConfig } from "@/core/config";
import { db } from "@/core/db";
import { modoWhatsApp } from "@/core/whatsapp/cliente";
import { exigirAdmin } from "@/lib/auth";

export default async function AdminWhatsapp() {
  await exigirAdmin("/admin/whatsapp");
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const [cfg, modo, porStatus, erros, webhooks, pendentesWebhook, enviadasHoje] = await Promise.all([
    obterConfig("whatsapp"),
    modoWhatsApp(),
    db.mensagem.groupBy({ by: ["status"], where: { direcao: "saida" }, _count: true }),
    db.logOperacao.findMany({ where: { etapa: "whatsapp", nivel: { in: ["erro", "aviso"] } }, orderBy: { criadoEm: "desc" }, take: 30 }),
    db.webhookEvento.findMany({ orderBy: { criadoEm: "desc" }, take: 15, select: { id: true, idExterno: true, processadoEm: true, erro: true, criadoEm: true } }),
    db.webhookEvento.count({ where: { processadoEm: null } }),
    db.mensagem.count({ where: { direcao: "saida", criadoEm: { gte: hoje }, status: { notIn: ["bloqueada", "falhou"] } } }),
  ]);

  return (
    <>
      <Titulo>WhatsApp</Titulo>
      <section className="cartao space-y-3 p-4 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-medium">Estado da conexão</h2>
          <span className={`selo ${modo === "mock" ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"}`}>{{ cloud: "Cloud API (real)", baileys: "Baileys (real, não oficial)", mock: "Simulado (mock)" }[modo]}</span>
          <Link href="/admin/integracoes" className="ml-auto text-marca-700 hover:underline">Credenciais e webhook</Link>
        </div>
        {modo === "baileys" ? (
          <>
            <p className="text-xs text-amber-700">Baileys não é oficial: a Meta pode banir o número. Use um número dedicado e mantenha os limites baixos.</p>
            <ConexaoBaileys />
          </>
        ) : (
          <TestarIntegracao integracao="whatsapp" />
        )}
        <p className="text-xs text-slate-500">Enviadas hoje: {enviadasHoje} de {cfg.limiteDiarioMensagens} · webhooks aguardando processamento: {pendentesWebhook}</p>
      </section>

      <FormConfig
        secao="whatsapp"
        valores={cfg}
        titulo="Limites de envio"
        descricao="Evitam envios indiscriminados e protegem a qualidade do número junto à Meta."
        campos={[
          { caminho: "limiteDiarioMensagens", rotulo: "Máx. mensagens enviadas por dia (todas)", tipo: "numero", min: 0, max: 10000 },
          { caminho: "limiteDiarioTemplates", rotulo: "Máx. templates (primeiros contatos) por dia", tipo: "numero", min: 0, max: 1000 },
          { caminho: "precoTemplateUsd", rotulo: "Custo estimado por template (US$, opcional)", tipo: "numero", min: 0, passo: 0.001, ajuda: "Para estimar custos. Consulte a tabela de preços da Meta para o Brasil. Vazio = sem estimativa." },
        ]}
      />

      <section className="cartao p-4 text-sm">
        <h2 className="mb-2 font-medium">Status das mensagens enviadas</h2>
        <div className="flex flex-wrap gap-3">
          {porStatus.length === 0 && <span className="text-slate-500">Nenhuma mensagem enviada ainda.</span>}
          {porStatus.map((s) => (
            <span key={s.status} className="cartao px-3 py-1.5">
              {s.status}: <strong>{s._count}</strong>
            </span>
          ))}
        </div>
      </section>

      <section className="cartao p-4 text-sm">
        <h2 className="mb-2 font-medium">Erros e bloqueios recentes</h2>
        {erros.length === 0 ? (
          <p className="text-slate-500">Nenhum.</p>
        ) : (
          <ul className="space-y-1 text-xs">
            {erros.map((e) => (
              <li key={e.id} className={e.nivel === "erro" ? "text-rose-700" : "text-amber-700"}>
                <span className="text-slate-400">{dataHora(e.criadoEm)}</span> {e.mensagem}
                {e.leadId && <Link href={`/leads/${e.leadId}`} className="ml-1 underline">lead</Link>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="cartao p-4 text-sm">
        <h2 className="mb-2 font-medium">Últimos eventos de webhook</h2>
        <table className="tabela">
          <thead>
            <tr><th>Evento</th><th>Recebido</th><th>Processado</th><th>Erro</th></tr>
          </thead>
          <tbody>
            {webhooks.map((w) => (
              <tr key={w.id}>
                <td className="font-mono text-xs">{w.idExterno.slice(0, 48)}</td>
                <td className="text-xs">{dataHora(w.criadoEm)}</td>
                <td className="text-xs">{w.processadoEm ? dataHora(w.processadoEm) : "pendente"}</td>
                <td className="text-xs text-rose-700">{w.erro}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}
