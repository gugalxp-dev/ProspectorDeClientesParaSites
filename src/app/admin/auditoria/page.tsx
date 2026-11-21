import { Titulo, dataHora } from "@/components/ui";
import { db } from "@/core/db";
import { exigirAdmin } from "@/lib/auth";

export default async function AdminAuditoria() {
  await exigirAdmin("/admin/auditoria");
  const [registros, usuarios] = await Promise.all([
    db.auditoria.findMany({ orderBy: { criadoEm: "desc" }, take: 300 }),
    db.usuario.findMany({ select: { id: true, nome: true } }),
  ]);
  const nome = Object.fromEntries(usuarios.map((u) => [u.id, u.nome]));
  return (
    <>
      <Titulo>Auditoria</Titulo>
      <p className="text-sm text-slate-600">Ações sensíveis: logins, credenciais, configurações, consentimentos, opt-outs, transferências, mensagens manuais e exclusões. Segredos nunca são gravados.</p>
      <div className="cartao overflow-x-auto">
        <table className="tabela">
          <thead>
            <tr><th>Quando</th><th>Quem</th><th>Ação</th><th>Alvo</th><th>Detalhe</th></tr>
          </thead>
          <tbody>
            {registros.map((r) => (
              <tr key={r.id}>
                <td className="whitespace-nowrap text-xs">{dataHora(r.criadoEm)}</td>
                <td className="text-xs">{r.usuarioId ? (nome[r.usuarioId] ?? r.usuarioId) : "sistema/cliente"}</td>
                <td className="text-xs font-medium">{r.acao}</td>
                <td className="font-mono text-xs">{r.alvo}</td>
                <td className="max-w-md break-all font-mono text-[11px] text-slate-500">{r.detalhe}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
