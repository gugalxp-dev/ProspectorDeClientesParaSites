import { EditorEtapas } from "@/components/admin/EditorEtapas";
import { Titulo } from "@/components/ui";
import { listarEtapas } from "@/core/crm/etapas";
import { exigirAdmin } from "@/lib/auth";

export default async function AdminCrm() {
  await exigirAdmin("/admin/crm");
  const etapas = await listarEtapas();
  return (
    <>
      <Titulo>Etapas do CRM</Titulo>
      <p className="text-sm text-slate-600">Renomeie, reordene, mude cores e crie etapas. As etapas marcadas como “automação” são usadas pelo sistema (ex.: transferência para humano) e podem ser renomeadas, mas não removidas.</p>
      <EditorEtapas etapas={etapas.map((e) => ({ id: e.id, nome: e.nome, cor: e.cor, sistema: e.sistema }))} />
    </>
  );
}
