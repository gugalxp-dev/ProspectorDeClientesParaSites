// Página pública do contrato: o cliente abre pelo link do WhatsApp, lê e dá o aceite. Não exige login.

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { AceiteContrato, BotaoImprimir } from "@/components/AceiteContrato";
import { TextoContrato } from "@/components/TextoContrato";
import { dataHora } from "@/components/ui";
import { obterConfig } from "@/core/config";
import { contratoPorToken, esquemaDadosContrato, marcarVisualizado, reais } from "@/core/contratos";

export const metadata: Metadata = { title: "Contrato", robots: { index: false, follow: false } };

export default async function ContratoPublico({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const c = await contratoPorToken(token);
  if (!c || !c.conteudo || c.status === "rascunho") notFound();
  const cfg = await obterConfig("contrato");
  const dados = esquemaDadosContrato.parse(JSON.parse(c.dados));
  if (c.status !== "cancelado") await marcarVisualizado(c.id);

  return (
    <div className="mx-auto max-w-3xl space-y-5 py-4">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4">
        <div>
          <div className="text-sm text-slate-500">Contrato nº {c.numero}</div>
          <div className="text-lg font-semibold text-slate-900">{cfg.contratadaNome || "Contrato de prestação de serviços"}</div>
        </div>
        <div className="text-right">
          <div className="text-xs text-slate-500">{dados.servico}</div>
          <div className="text-2xl font-bold text-marca-700">{reais(dados.valorCentavos)}</div>
          <div className="text-xs text-slate-500">entrega em até {dados.prazoDias} dias</div>
        </div>
      </header>

      {c.status === "cancelado" && <p className="erro">Este contrato foi cancelado e não é mais válido.</p>}

      <article className="cartao p-6 sm:p-8">
        <TextoContrato texto={c.conteudo} />
      </article>

      {c.status === "aceito" ? (
        <div className="flex items-start gap-3 rounded-lg border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-900">
          <ShieldCheck className="size-6 shrink-0" />
          <div className="space-y-1">
            <strong>Contrato aceito eletronicamente</strong>
            <div>Por {c.aceiteNome} ({c.aceiteDocumento}) em {dataHora(c.aceitoEm)} · IP {c.aceiteIp}</div>
            <div className="break-all text-xs text-emerald-800/80">Código de integridade do texto: {c.conteudoHash}</div>
            <div className="pt-1"><BotaoImprimir /></div>
          </div>
        </div>
      ) : c.status !== "cancelado" ? (
        <AceiteContrato token={token} nomeSugerido="" />
      ) : null}
    </div>
  );
}
