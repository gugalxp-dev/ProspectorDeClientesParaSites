"use client";

import { Crud } from "./Crud";

type R = Record<string, unknown> & { id: string };

export function ListaConhecimento({ itens }: { itens: R[] }) {
  return (
    <Crud
      url="/api/admin/conhecimento"
      itens={itens}
      novoPadrao={{ ativo: true }}
      campos={[
        { nome: "categoria", rotulo: "Categoria", tipo: "texto", obrigatorio: true, ajuda: "Ex.: benefícios, objeções, segmentos, serviços, diferenças site x redes sociais" },
        { nome: "titulo", rotulo: "Título", tipo: "texto", obrigatorio: true },
        { nome: "conteudo", rotulo: "Conteúdo", tipo: "area", obrigatorio: true },
        { nome: "tags", rotulo: "Palavras-chave (separadas por vírgula)", tipo: "texto" },
        { nome: "ativo", rotulo: "Ativo (o agente pode usar)", tipo: "booleano" },
      ]}
      resumo={(r) => (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <span className="selo bg-slate-100 text-slate-700">{String(r.categoria)}</span>
            <strong>{String(r.titulo)}</strong>
            {!r.ativo && <span className="selo bg-zinc-100 text-zinc-500">inativo</span>}
            <span className="text-xs text-slate-400">usos: {String(r.usos ?? 0)}</span>
          </div>
          <p className="mt-1 line-clamp-2 text-xs text-slate-600">{String(r.conteudo)}</p>
        </>
      )}
    />
  );
}

const reais = (c: unknown) => (Number(c) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function ListaServicos({ itens }: { itens: R[] }) {
  return (
    <Crud
      url="/api/admin/servicos"
      itens={itens}
      novoPadrao={{ ativo: true, descontoMaxPct: 0, descontoMaxCentavos: 0, ordem: 0 }}
      campos={[
        { nome: "nome", rotulo: "Nome do serviço", tipo: "texto", obrigatorio: true },
        { nome: "precoCentavos", rotulo: "Preço (R$)", tipo: "reais", obrigatorio: true, ajuda: "Ex.: 1.500,00" },
        { nome: "prazoDias", rotulo: "Prazo de entrega (dias)", tipo: "numero", obrigatorio: true },
        { nome: "descontoMaxCentavos", rotulo: "Desconto máximo que o agente pode conceder (R$)", tipo: "reais", ajuda: "Ex.: 100,00. Só em último caso, depois de o cliente insistir." },
        { nome: "descontoMaxPct", rotulo: "Ou desconto máximo em % (vale o maior dos dois)", tipo: "numero", obrigatorio: true, ajuda: "Deixe 0 para usar só o valor em reais." },
        { nome: "descricao", rotulo: "O que está incluído", tipo: "area", obrigatorio: true },
        { nome: "condicoes", rotulo: "Condições (pagamento, parcelamento, o que não está incluso)", tipo: "area", ajuda: "Valores escritos aqui (ex.: “entrada de R$ 500,00”) também podem ser citados pelo agente." },
        { nome: "ordem", rotulo: "Ordem de exibição", tipo: "numero" },
        { nome: "ativo", rotulo: "Ativo (o agente pode oferecer)", tipo: "booleano" },
      ]}
      resumo={(r) => (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <strong>{String(r.nome)}</strong>
            <span>{reais(r.precoCentavos)}</span>
            <span className="text-xs text-slate-500">{String(r.prazoDias)} dias · desconto até {Number(r.descontoMaxCentavos) > 0 ? reais(r.descontoMaxCentavos) : `${String(r.descontoMaxPct)}%`}</span>
            {!r.ativo && <span className="selo bg-zinc-100 text-zinc-500">inativo</span>}
          </div>
          <p className="mt-1 line-clamp-2 text-xs text-slate-600">{String(r.descricao)}</p>
        </>
      )}
    />
  );
}
