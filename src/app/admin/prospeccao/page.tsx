import { FontesDescoberta } from "@/components/admin/FontesDescoberta";
import { FormConfig } from "@/components/admin/FormConfig";
import { Titulo } from "@/components/ui";
import { obterConfig } from "@/core/config";
import { todasAsFontes } from "@/core/fontes";
import { exigirAdmin } from "@/lib/auth";

export default async function AdminProspeccao() {
  await exigirAdmin("/admin/prospeccao");
  const [cfg, pesos] = await Promise.all([obterConfig("prospeccao"), obterConfig("pesos")]);
  const fontes = await Promise.all(
    todasAsFontes().map(async (f) => ({ id: f.id, nome: f.nome, descricao: f.descricao, aviso: f.aviso ?? null, gratuita: f.gratuita, ativa: !!cfg.fontes[f.id]?.ativa, disponivel: await f.disponivel() })),
  );
  return (
    <>
      <Titulo>Prospecção</Titulo>
      <FontesDescoberta fontes={fontes} />
      <FormConfig
        secao="prospeccao"
        valores={cfg}
        titulo="Limites de processamento"
        campos={[
          { caminho: "maxEmpresasPorBusca", rotulo: "Máx. empresas por pesquisa (por fonte)", tipo: "numero", min: 10, max: 2000 },
          { caminho: "buscasSimultaneas", rotulo: "Descobertas simultâneas", tipo: "numero", min: 1, max: 10 },
          { caminho: "qualificarAutomaticamente", rotulo: "Qualificar com IA automaticamente após a coleta", tipo: "booleano" },
          { caminho: "exigirCelular", rotulo: "Só empresas com celular ou WhatsApp", tipo: "booleano", ajuda: "Telefone fixo é ignorado (não tem WhatsApp). Quem não se enquadra não é registrado nem analisado." },
          { caminho: "ignorarRedes", rotulo: "Ignorar redes e franquias", tipo: "booleano", ajuda: "Usa a marca cadastrada no OpenStreetMap e a lista abaixo." },
          { caminho: "redesIgnoradas", rotulo: "Redes ignoradas (uma por linha)", tipo: "lista" },
          { caminho: "descartarComSiteBom", rotulo: "Descartar empresas que já têm site bom", tipo: "booleano", ajuda: "Site no ar e sem problemas técnicos. Sites fora do ar ou com problemas continuam." },
          { caminho: "scoreMinimoQualificado", rotulo: "Score mínimo para “Qualificado”", tipo: "numero", min: 0, max: 100 },
          { caminho: "pesoIaPct", rotulo: "Peso da IA no score final (%)", tipo: "numero", min: 0, max: 100, ajuda: "Score = regras × (100 − peso)% + IA × peso%." },
          { caminho: "reverificarSiteAposDias", rotulo: "Reavaliar site depois de (dias)", tipo: "numero", min: 1, max: 365 },
        ]}
      />
      <FormConfig
        secao="prospeccao"
        valores={cfg}
        titulo="Crawler"
        descricao="O crawler respeita robots.txt, não usa navegador, não passa por CAPTCHA/login e se identifica como robô."
        campos={[
          { caminho: "crawler.profundidade", rotulo: "Profundidade máxima de links", tipo: "numero", min: 0, max: 4 },
          { caminho: "crawler.maxPaginasPorSite", rotulo: "Máx. páginas por site", tipo: "numero", min: 1, max: 30 },
          { caminho: "crawler.concorrencia", rotulo: "Sites analisados ao mesmo tempo", tipo: "numero", min: 1, max: 16 },
          { caminho: "crawler.atrasoPorHostMs", rotulo: "Intervalo entre requisições ao mesmo site (ms)", tipo: "numero", min: 250, max: 30000 },
          { caminho: "crawler.timeoutMs", rotulo: "Tempo limite por página (ms)", tipo: "numero", min: 2000, max: 60000 },
          { caminho: "crawler.respeitarRobots", rotulo: "Respeitar robots.txt", tipo: "booleano" },
        ]}
      />
      <FormConfig
        secao="pesos"
        valores={pesos}
        titulo="Pontuação por regras"
        descricao="Pontos somados (limitado a 0–100). Critérios transparentes, mostrados em cada lead."
        campos={[
          { caminho: "semSite", rotulo: "Nenhum site identificado", tipo: "numero" },
          { caminho: "soRedeSocial", rotulo: "Só rede social", tipo: "numero" },
          { caminho: "siteForaDoAr", rotulo: "Site fora do ar", tipo: "numero" },
          { caminho: "siteComProblemas", rotulo: "Site com problemas técnicos", tipo: "numero" },
          { caminho: "comSite", rotulo: "Site no ar", tipo: "numero" },
          { caminho: "celular", rotulo: "Telefone celular", tipo: "numero" },
          { caminho: "email", rotulo: "E-mail encontrado", tipo: "numero" },
          { caminho: "redeSocial", rotulo: "Ativo em rede social", tipo: "numero" },
        ]}
      />
    </>
  );
}
