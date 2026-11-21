import { FormConfig } from "@/components/admin/FormConfig";
import { Titulo } from "@/components/ui";
import { obterConfig } from "@/core/config";
import { db } from "@/core/db";
import { exigirAdmin } from "@/lib/auth";

export default async function AdminLgpd() {
  await exigirAdmin("/admin/lgpd");
  const [cfg, supressoes, optins, optouts] = await Promise.all([
    obterConfig("lgpd"),
    db.supressao.count(),
    db.consentimento.count({ where: { tipo: "opt_in" } }),
    db.consentimento.count({ where: { tipo: "opt_out" } }),
  ]);
  return (
    <>
      <Titulo>LGPD e retenção de dados</Titulo>
      <div className="cartao space-y-2 p-4 text-sm text-slate-700">
        <p>Coletar dados públicos não elimina as obrigações da LGPD. O sistema:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>exige opt-in registrado (origem e base legal) antes do primeiro contato; telefone público não é autorização;</li>
          <li>respeita opt-out na hora, inclusive por palavras como “parar”, e mantém uma lista de supressão (só o hash do número) que nunca é apagada;</li>
          <li>permite excluir todos os dados de um lead (página do lead, só admin), com registro na auditoria;</li>
          <li>apaga automaticamente, uma vez por dia, dados além dos prazos abaixo.</li>
        </ul>
        <p className="text-xs text-slate-500">Opt-ins registrados: {optins} · opt-outs: {optouts} · números na supressão: {supressoes}</p>
      </div>
      <FormConfig
        secao="lgpd"
        valores={cfg}
        titulo="Prazos de retenção"
        campos={[
          { caminho: "retencaoDiasLeadsSemContato", rotulo: "Apagar leads nunca contatados e sem autorização após (dias)", tipo: "numero", min: 7, max: 3650 },
          { caminho: "retencaoDiasMensagens", rotulo: "Apagar mensagens após (dias)", tipo: "numero", min: 30, max: 3650 },
          { caminho: "retencaoDiasLogs", rotulo: "Apagar logs técnicos após (dias)", tipo: "numero", min: 7, max: 3650 },
        ]}
      />
    </>
  );
}
