import { GestaoUsuarios } from "@/components/admin/GestaoUsuarios";
import { Titulo } from "@/components/ui";
import { db } from "@/core/db";
import { exigirAdmin } from "@/lib/auth";

export default async function AdminUsuarios() {
  const eu = await exigirAdmin("/admin/usuarios");
  const usuarios = await db.usuario.findMany({ omit: { senhaHash: true }, orderBy: { criadoEm: "asc" } });
  return (
    <>
      <Titulo>Usuários</Titulo>
      <p className="text-sm text-slate-600">Admin acessa tudo. Operador usa pesquisas, CRM e conversas, sem acesso a configurações, credenciais e exclusão de dados.</p>
      <GestaoUsuarios
        euId={eu.id}
        usuarios={usuarios.map((u) => ({ id: u.id, nome: u.nome, email: u.email, papel: u.papel, bloqueado: !!u.bloqueadoEm, ultimoAcesso: u.ultimoAcesso?.toISOString() ?? null }))}
      />
    </>
  );
}
