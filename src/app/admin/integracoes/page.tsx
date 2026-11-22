import { headers } from "next/headers";
import { Credenciais, TestarIntegracao } from "@/components/admin/Integracoes";
import { Titulo } from "@/components/ui";
import { provedorAtivo } from "@/core/ia/servico";
import { estadoCredenciais } from "@/core/segredos";
import { modoWhatsApp } from "@/core/whatsapp/cliente";
import { exigirAdmin } from "@/lib/auth";
import { env } from "@/lib/env";

export default async function Integracoes() {
  await exigirAdmin("/admin/integracoes");
  const [creds, ia, wa, h] = await Promise.all([estadoCredenciais(), provedorAtivo(), modoWhatsApp(), headers()]);
  const base = env().APP_URL ?? `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
  const webhook = `${base.replace(/\/$/, "")}/api/webhooks/whatsapp`;
  const visiveis = creds.map((c) => ({ nome: c.nome, rotulo: c.rotulo, grupo: c.grupo, origem: c.origem, final: c.final }));

  return (
    <>
      <Titulo>Integrações</Titulo>
      <p className="text-sm text-slate-600">
        Credenciais podem vir do arquivo <code>.env</code> (recomendado) ou ser cadastradas aqui — ficam cifradas (AES-256-GCM) no banco e nunca voltam inteiras para a tela.
        O valor do <code>.env</code> tem prioridade.
      </p>

      <section className="cartao space-y-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-medium">Inteligência artificial (Claude)</h2>
          <span className={`selo ${ia.nome !== "mock" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>{ia.nome === "anthropic" ? "Claude configurado" : ia.nome === "openai" ? "Usando OpenAI" : "Simulada"}</span>
        </div>
        {ia.motivo && <p className="text-xs text-amber-800">{ia.motivo}</p>}
        <p className="text-xs text-slate-500">Só a chave da Anthropic é necessária. A da OpenAI é opcional: serve como provedor alternativo e para embeddings da base de conhecimento.</p>
        <Credenciais itens={visiveis.filter((c) => c.grupo === "ia")} />
        <TestarIntegracao integracao="ia" />
      </section>

      <section className="cartao space-y-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-medium">WhatsApp Business Cloud API (Meta)</h2>
          <span className={`selo ${wa === "mock" ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"}`}>{{ cloud: "Modo real (cloud)", baileys: "Modo real (Baileys, QR em Admin > WhatsApp)", mock: "Modo simulado (mock)" }[wa]}</span>
        </div>
        <div className="rounded-md bg-slate-50 p-3 text-xs text-slate-700">
          <p className="font-medium">Configuração do webhook no Meta Developers (WhatsApp &gt; Configuração):</p>
          <p className="mt-1">URL de callback: <code className="select-all break-all">{webhook}</code></p>
          <p>Token de verificação: o valor de <code>WHATSAPP_VERIFY_TOKEN</code> (gerado pelo <code>npm run setup</code>).</p>
          <p>Campos para assinar: <code>messages</code>.</p>
          <p className="mt-1 text-slate-500">A Meta exige HTTPS público. Em ambiente local, use um túnel (ex.: Cloudflare Tunnel) e preencha <code>APP_URL</code>.</p>
        </div>
        <Credenciais itens={visiveis.filter((c) => c.grupo === "whatsapp")} />
        <TestarIntegracao integracao="whatsapp" />
      </section>

    </>
  );
}
