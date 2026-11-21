import { ListaConhecimento } from "@/components/admin/Listas";
import { Titulo } from "@/components/ui";
import { db } from "@/core/db";
import { exigirAdmin } from "@/lib/auth";

export default async function AdminConhecimento() {
  await exigirAdmin("/admin/conhecimento");
  const itens = await db.conhecimento.findMany({ orderBy: [{ categoria: "asc" }, { titulo: "asc" }], omit: { embedding: true } });
  return (
    <>
      <Titulo>Base de conhecimento</Titulo>
      <p className="text-sm text-slate-600">
        O agente consulta esta base a cada resposta (RAG: busca por palavras + embeddings quando houver chave da OpenAI) e usa os trechos mais relevantes
        para argumentar. Edite aqui, sem mexer no código. “Usos” mostra quantas vezes cada item entrou no contexto do agente.
      </p>
      <ListaConhecimento itens={itens.map((i) => ({ ...i, criadoEm: i.criadoEm.toISOString(), atualizadoEm: i.atualizadoEm.toISOString() }))} />
    </>
  );
}
