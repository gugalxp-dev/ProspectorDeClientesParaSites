import Link from "next/link";
import { ListaServicos } from "@/components/admin/Listas";
import { Titulo } from "@/components/ui";
import { db } from "@/core/db";
import { exigirAdmin } from "@/lib/auth";

export default async function AdminComercial() {
  await exigirAdmin("/admin/comercial");
  const servicos = await db.servico.findMany({ orderBy: [{ ordem: "asc" }, { nome: "asc" }] });
  return (
    <>
      <Titulo>Serviços, preços e condições</Titulo>
      <p className="text-sm text-slate-600">
        O agente só pode citar estes preços, prazos e condições. Qualquer valor fora disso (ou desconto acima do limite) bloqueia a mensagem e transfere para você.
        Regras de transferência ficam em <Link href="/admin/agente" className="text-marca-700 underline">Agente</Link>.
      </p>
      {servicos.length === 0 && <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">Nenhum serviço cadastrado: o agente não informará preços e transferirá quando perguntarem.</p>}
      <ListaServicos itens={servicos.map((s) => ({ ...s, criadoEm: s.criadoEm.toISOString(), atualizadoEm: s.atualizadoEm.toISOString() }))} />
    </>
  );
}
