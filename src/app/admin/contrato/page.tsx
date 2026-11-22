import Link from "next/link";
import { FormConfig } from "@/components/admin/FormConfig";
import { LogoContrato } from "@/components/admin/LogoContrato";
import { Titulo, dataHora } from "@/components/ui";
import { obterConfig } from "@/core/config";
import { esquemaDadosContrato, reais, VARIAVEIS } from "@/core/contratos";
import { db } from "@/core/db";
import { exigirAdmin } from "@/lib/auth";

const STATUS: Record<string, string> = { rascunho: "Rascunho", pronto: "Pronto", enviado: "Enviado", visualizado: "Cliente abriu", aceito: "Aceito", cobrado: "Cobrado", cancelado: "Cancelado" };

export default async function AdminContrato() {
  await exigirAdmin("/admin/contrato");
  const [cfg, contratos] = await Promise.all([
    obterConfig("contrato"),
    db.contrato.findMany({ orderBy: { criadoEm: "desc" }, take: 30, include: { lead: { select: { id: true, nome: true } } } }),
  ]);
  return (
    <>
      <Titulo>Contrato</Titulo>
      <p className="text-sm text-slate-600">
        Um modelo único para todos os clientes, sem IA (não gasta token). Na página do lead você preenche só os dados essenciais, lê a prévia e envia.
        O cliente recebe um link, lê e dá o aceite eletrônico.
      </p>

      <LogoContrato inicial={cfg.logo} />

      <FormConfig
        secao="contrato"
        valores={cfg}
        titulo="Sua empresa (contratada)"
        campos={[
          { caminho: "contratadaNome", rotulo: "Razão social ou nome *", tipo: "texto" },
          { caminho: "contratadaDocumento", rotulo: "CNPJ ou CPF *", tipo: "texto" },
          { caminho: "contratadaEndereco", rotulo: "Endereço", tipo: "texto" },
          { caminho: "contratadaEmail", rotulo: "E-mail", tipo: "texto" },
          { caminho: "cidade", rotulo: "Cidade (aparece na data do contrato)", tipo: "texto" },
          { caminho: "foro", rotulo: "Foro (comarca)", tipo: "texto", ajuda: "Vazio = mesma cidade." },
        ]}
      />

      <FormConfig
        secao="contrato"
        valores={cfg}
        titulo="Modelo do contrato e mensagem de envio"
        descricao={`Variáveis disponíveis: ${VARIAVEIS.map((v) => `{{${v}}}`).join(" ")}. Linhas com "# " viram título e "## " subtítulo.`}
        campos={[
          { caminho: "modelo", rotulo: "Texto do contrato", tipo: "area" },
          { caminho: "mensagemEnvio", rotulo: "Mensagem do WhatsApp com o link", tipo: "area", ajuda: "Aceita {{nome}}, {{numero}} e {{link}}." },
        ]}
      />

      <section className="cartao p-4 text-sm">
        <h2 className="mb-2 font-medium">Contratos recentes</h2>
        {contratos.length === 0 ? (
          <p className="text-slate-500">Nenhum ainda. Gere pela página de um lead.</p>
        ) : (
          <table className="tabela">
            <thead>
              <tr><th>Nº</th><th>Cliente</th><th>Valor</th><th>Status</th><th>Criado</th></tr>
            </thead>
            <tbody>
              {contratos.map((c) => (
                <tr key={c.id}>
                  <td className="font-mono text-xs">{c.numero}</td>
                  <td><Link href={`/leads/${c.lead.id}`} className="text-marca-700 hover:underline">{c.lead.nome}</Link></td>
                  <td className="tabular-nums">{reais(esquemaDadosContrato.parse(JSON.parse(c.dados)).valorCentavos)}</td>
                  <td className={["aceito", "cobrado"].includes(c.status) ? "font-semibold text-emerald-700" : ""}>{STATUS[c.status] ?? c.status}</td>
                  <td className="text-xs">{dataHora(c.criadoEm)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}
