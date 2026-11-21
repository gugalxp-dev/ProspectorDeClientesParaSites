import { EditorPrecos } from "@/components/admin/EditorPrecos";
import { FormConfig } from "@/components/admin/FormConfig";
import { Titulo } from "@/components/ui";
import { obterConfig } from "@/core/config";
import { exigirAdmin } from "@/lib/auth";

export default async function AdminIa() {
  await exigirAdmin("/admin/ia");
  const cfg = await obterConfig("ia");
  return (
    <>
      <Titulo>Inteligência artificial</Titulo>
      <FormConfig
        secao="ia"
        valores={cfg}
        titulo="Provedor e modelo"
        descricao='Provedor "auto" usa o Claude quando houver chave da Anthropic (senão a OpenAI, se houver chave; senão o modo simulado).'
        campos={[
          { caminho: "provedor", rotulo: "Provedor", tipo: "opcoes", opcoes: [["auto", "Automático (Claude se houver chave)"], ["anthropic", "Anthropic (Claude)"], ["openai", "OpenAI"], ["mock", "Simulado (sem custo)"]] },
          {
            caminho: "modelo",
            rotulo: "Modelo Claude",
            tipo: "opcoes",
            opcoes: [["claude-opus-5-5", "Claude Opus 5.5 (melhor qualidade · US$ 4 / 20 por 1M tokens)"], ["claude-sonnet-5-5", "Claude Sonnet 5.5 (equilibrado · US$ 2 / 10)"], ["claude-haiku-5-5", "Claude Haiku 5.5 (mais barato e rápido · US$ 0,10 / 0,50)"]],
          },
          { caminho: "esforco", rotulo: "Esforço de raciocínio", tipo: "opcoes", opcoes: [["low", "Baixo (mais rápido e barato)"], ["medium", "Médio (recomendado)"], ["high", "Alto (mais cuidadoso, mais caro)"]] },
          { caminho: "maxTokensResposta", rotulo: "Máximo de tokens por resposta", tipo: "numero", min: 1000, max: 32000, ajuda: "Inclui o raciocínio do modelo; valores baixos podem cortar a resposta." },
          { caminho: "timeoutMs", rotulo: "Tempo limite por chamada (ms)", tipo: "numero", min: 5000, max: 120000 },
        ]}
      />
      <FormConfig
        secao="ia"
        valores={cfg}
        titulo="OpenAI (opcional)"
        descricao="Só usado se o provedor for OpenAI, ou para embeddings da base de conhecimento quando houver chave da OpenAI. Sem ela, a busca na base usa palavras-chave (BM25)."
        campos={[
          { caminho: "modeloOpenai", rotulo: "Modelo da OpenAI", tipo: "texto" },
          { caminho: "temperatura", rotulo: "Temperatura (só OpenAI)", tipo: "numero", min: 0, max: 2, passo: 0.1 },
          { caminho: "usarEmbeddings", rotulo: "Usar embeddings da OpenAI na busca da base de conhecimento", tipo: "booleano" },
          { caminho: "modeloEmbedding", rotulo: "Modelo de embeddings", tipo: "texto" },
        ]}
      />
      <FormConfig
        secao="ia"
        valores={cfg}
        titulo="Limites de consumo"
        descricao="Chamadas pagas são bloqueadas ao atingir o limite. 0 = sem limite (não recomendado)."
        campos={[
          { caminho: "limiteDiarioUsd", rotulo: "Limite diário (US$)", tipo: "numero", min: 0, passo: 0.5 },
          { caminho: "limiteMensalUsd", rotulo: "Limite mensal (US$)", tipo: "numero", min: 0, passo: 1 },
          { caminho: "alertaPct", rotulo: "Alertar ao atingir (% do limite)", tipo: "numero", min: 1, max: 100 },
        ]}
      />
      <PrecoModelos precos={cfg.precos} />
    </>
  );
}

function PrecoModelos({ precos }: { precos: Record<string, { entradaPorMilhao: number; saidaPorMilhao: number }> }) {
  return (
    <section className="cartao p-4 text-sm">
      <h2 className="font-medium">Tabela de preços usada nas estimativas</h2>
      <p className="ajuda">US$ por 1 milhão de tokens. Os custos exibidos são ESTIMATIVAS com base nesta tabela; confira os valores atuais em claude.com/pricing (e openai.com/api/pricing, se usar OpenAI) e ajuste pelo campo abaixo.</p>
      <table className="tabela mt-2">
        <thead>
          <tr><th>Modelo</th><th>Entrada</th><th>Saída</th></tr>
        </thead>
        <tbody>
          {Object.entries(precos).map(([m, p]) => (
            <tr key={m}><td>{m}</td><td>{p.entradaPorMilhao}</td><td>{p.saidaPorMilhao}</td></tr>
          ))}
        </tbody>
      </table>
      <EditorPrecos precos={precos} />
    </section>
  );
}
