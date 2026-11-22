// Página pública do contrato: o cliente abre pelo link do WhatsApp, lê e dá o aceite. Não exige login.
// O link chega como cartão (título, descrição e imagem: opengraph-image.tsx), com a marca da sua empresa.

import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { ArrowDown, CalendarClock, FileSignature, ShieldCheck } from "lucide-react";
import { AceiteContrato, BotaoImprimir } from "@/components/AceiteContrato";
import { FolhaContrato } from "@/components/TextoContrato";
import { dataHora } from "@/components/ui";
import { marcarVisualizado } from "@/core/contratos";
import { env } from "@/lib/env";
import { dadosContratoPublico, ROBO_PREVIA } from "./dados";

type Props = { params: Promise<{ token: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const p = await dadosContratoPublico((await params).token);
  if (!p) return { title: "Contrato não encontrado", robots: { index: false, follow: false } };
  const h = await headers();
  const base = env().APP_URL ?? `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host") ?? "localhost:3000"}`;
  const titulo = ["aceito", "cobrado"].includes(p.c.status) ? `Contrato aceito · ${p.marca}` : `Contrato nº ${p.c.numero} · ${p.marca}`;
  const descricao =
    p.c.status === "cancelado"
      ? "Este contrato foi cancelado."
      : ["aceito", "cobrado"].includes(p.c.status)
        ? `${p.dados.servico} para ${p.dados.contratanteNome}. Aceito eletronicamente.`
        : `${p.dados.servico} para ${p.dados.contratanteNome}: ${p.valor}, entrega em até ${p.dados.prazoDias} dias. Toque para ler e confirmar o aceite online.`;
  return {
    metadataBase: new URL(base),
    title: { absolute: titulo },
    description: descricao,
    robots: { index: false, follow: false },
    icons: p.cfg.logo ? { icon: p.cfg.logo, apple: p.cfg.logo } : undefined,
    openGraph: { type: "website", locale: "pt_BR", siteName: p.marca, title: titulo, description: descricao },
    twitter: { card: "summary_large_image", title: titulo, description: descricao },
  };
}

export default async function ContratoPublico({ params }: Props) {
  const { token } = await params;
  const p = await dadosContratoPublico(token);
  if (!p) notFound();
  const { c, cfg, dados, marca, valor } = p;
  // A prévia do link (robô do WhatsApp) não conta como "cliente abriu".
  const agente = (await headers()).get("user-agent") ?? "";
  if (c.status !== "cancelado" && !ROBO_PREVIA.test(agente)) await marcarVisualizado(c.id);
  const aceito = ["aceito", "cobrado"].includes(c.status);
  const pendente = !aceito && c.status !== "cancelado";

  return (
    <div className="mx-auto max-w-[820px] space-y-5 py-2">
      <header className="flex flex-wrap items-center justify-between gap-4 print:hidden">
        <div className="flex items-center gap-3">
          {cfg.logo && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={cfg.logo} alt="" className="size-11 rounded-xl" />
          )}
          <div>
            <div className="text-lg font-semibold text-slate-900">{marca}</div>
            <div className="text-xs text-slate-500">Contrato nº {c.numero}</div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-xs text-slate-500">{dados.servico}</div>
          <div className="text-2xl font-bold text-marca-700">{valor}</div>
          <div className="text-xs text-slate-500">entrega em até {dados.prazoDias} dias</div>
        </div>
      </header>

      {pendente && (
        <div className="cartao flex flex-wrap items-center gap-4 p-4 text-sm print:hidden">
          <FileSignature className="size-6 shrink-0 text-marca-600" />
          <div className="min-w-0 flex-1">
            <div className="font-medium text-slate-900">Olá, {dados.contratanteNome}!</div>
            <div className="text-slate-600">Leia o contrato abaixo com calma. Se estiver tudo certo, confirme no final da página: leva menos de 1 minuto.</div>
          </div>
          <a href="#aceite" className="botao">
            <ArrowDown className="size-4" /> Ir para o aceite
          </a>
        </div>
      )}

      {c.status === "cancelado" && <p className="erro">Este contrato foi cancelado e não é mais válido.</p>}

      <FolhaContrato texto={c.conteudo!} cabecalho={{ logo: cfg.logo, empresa: marca, numero: c.numero }} />

      <div id="aceite" className="scroll-mt-6">
        {aceito ? (
          <div className="flex items-start gap-3 rounded-lg bg-[#059669] p-4 text-sm text-[#ffffff] shadow-lg">
            <ShieldCheck className="size-6 shrink-0" />
            <div className="space-y-1">
              <strong>Contrato aceito eletronicamente</strong>
              <div>Por {c.aceiteNome} ({c.aceiteDocumento}) em {dataHora(c.aceitoEm)} · IP {c.aceiteIp}</div>
              <div className="break-all text-xs text-[#ffffff]/80">Código de integridade do texto: {c.conteudoHash}</div>
              <div className="pt-1"><BotaoImprimir /></div>
            </div>
          </div>
        ) : pendente ? (
          <AceiteContrato token={token} nomeSugerido="" />
        ) : null}
      </div>

      {pendente && (
        <p className="flex items-center justify-center gap-1.5 pb-6 text-center text-xs text-slate-500 print:hidden">
          <CalendarClock className="size-3.5" /> Dúvidas? Responda a mensagem no WhatsApp que a gente explica.
        </p>
      )}
    </div>
  );
}
