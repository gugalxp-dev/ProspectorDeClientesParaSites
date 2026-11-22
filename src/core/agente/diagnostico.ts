// Diagnóstico da empresa para a conversa comercial: transforma a análise da prospecção (site, presença,
// qualificação) em fatos em linguagem de dono de negócio, cada um com o IMPACTO para o cliente dele.
// Usado (1) no contexto do agente e (2) no gancho do primeiro contato, que é montado por regras (sem IA, sem custo).

import type { AvaliacaoSite } from "../prospeccao/avaliacaoSite";
import type { Qualificacao } from "../prospeccao/qualificacao";

export interface LeadDiagnostico {
  nome: string;
  presenca: string;
  presencaConfianca: string;
  website: string | null;
  siteAvaliacao: string | null;
  qualificacao: string | null;
  instagram: string | null;
  facebook: string | null;
  whatsappE164: string | null;
}

/** Problema técnico do site -> como explicar para o dono e o impacto no negócio dele. */
const TRADUCAO: Record<string, { fato: string; impacto: string }> = {
  acessivel: { fato: "o site não está abrindo", impacto: "quem procura a empresa no Google encontra uma página quebrada e vai para o concorrente" },
  mobile: { fato: "o site não é adaptado para celular", impacto: "a maioria das pessoas pesquisa pelo celular e acaba vendo tudo pequeno e desalinhado" },
  https: { fato: "o site aparece como \"não seguro\" no navegador", impacto: "o aviso de site não seguro passa desconfiança e afasta clientes" },
  rapido: { fato: "o site demora para carregar", impacto: "muita gente desiste quando a página demora alguns segundos" },
  contato: { fato: "o site não mostra uma forma de contato clara", impacto: "o cliente interessado não acha como falar com a empresa" },
  whatsapp: { fato: "o site não tem botão de WhatsApp", impacto: "o cliente precisa copiar o número em vez de chamar com um toque" },
  atualizado: { fato: "o site parece desatualizado", impacto: "site parado passa a impressão de empresa parada" },
  tecnologia: { fato: "o site usa tecnologia antiga", impacto: "partes dele podem nem funcionar nos navegadores atuais" },
  links: { fato: "algumas páginas do site estão com erro", impacto: "o cliente clica e cai numa página que não existe" },
  endereco: { fato: "o site não mostra endereço ou mapa", impacto: "fica mais difícil o cliente chegar até a empresa" },
  descricao: { fato: "o site não tem descrição para o Google", impacto: "o Google mostra um resumo ruim (ou nenhum) da empresa nas buscas" },
};
/** Construtores de site gratuitos: o site fica num endereço da plataforma, sem domínio próprio. */
const PLATAFORMA_GRATIS = /(^|.)(ueniweb.com|wixsite.com|webnode.page|webnode.com(.br)?|negocio.site|business.site|blogspot.com|wordpress.com|godaddysites.com|site123.me|weebly.com|carrd.co|my.canva.site|netlify.app|vercel.app|github.io|squarespace.com|jimdosite.com|strikingly.com|mystrikingly.com)$/i;

export function emPlataformaGratuita(site: string | null): boolean {
  if (!site) return false;
  try {
    return PLATAFORMA_GRATIS.test(new URL(/^https?:/i.test(site) ? site : `https://${site}`).hostname);
  } catch {
    return false;
  }
}

const ORDEM = ["acessivel", "mobile", "https", "contato", "whatsapp", "rapido", "links", "atualizado", "tecnologia", "endereco", "descricao"];

export interface Diagnostico {
  presenca: string;
  fatos: Array<{ fato: string; impacto: string }>;
  pontosFortes: string[];
  canais: string[];
  hipoteses: string[];
  oportunidades: string[];
  resumoAnalise: string | null;
  /** "Sem site identificado" com pouca confiança: perguntar, nunca afirmar. */
  incerto: boolean;
}

export function diagnosticar(l: LeadDiagnostico): Diagnostico {
  const a = l.siteAvaliacao ? (JSON.parse(l.siteAvaliacao) as AvaliacaoSite) : null;
  const q = l.qualificacao ? (JSON.parse(l.qualificacao) as Qualificacao) : null;
  const canais = [l.instagram && "Instagram", l.facebook && "Facebook", l.whatsappE164 && "WhatsApp"].filter(Boolean) as string[];
  const fatos: Diagnostico["fatos"] = [];
  const pontosFortes: string[] = [];
  let presenca: string;

  if (l.presenca === "sem_site_identificado") {
    presenca = "Não encontramos site próprio da empresa nas fontes consultadas.";
    if (l.presencaConfianca !== "baixa") fatos.push({ fato: "a empresa não tem site próprio", impacto: "quem pesquisa no Google não encontra a empresa, ou encontra só o concorrente" });
  } else if (l.presenca === "so_rede_social") {
    presenca = `A empresa usa só rede social (${canais.filter((c) => c !== "WhatsApp").join(", ") || "rede social"}) no lugar de site.`;
    fatos.push({ fato: "a empresa depende só da rede social", impacto: "não aparece bem no Google, e o perfil depende do algoritmo e das regras da plataforma" });
  } else if (l.presenca === "site_fora_do_ar") {
    presenca = `O site ${l.website ?? ""} está fora do ar${a?.motivoFora ? ` (${a.motivoFora})` : ""}.`;
    fatos.push(TRADUCAO.acessivel);
  } else {
    presenca = `Tem site no ar: ${l.website ?? ""}.`;
    if (emPlataformaGratuita(l.website)) {
      fatos.push({ fato: "o site está num endereço gratuito de plataforma, sem domínio próprio (.com.br)", impacto: "passa menos profissionalismo, é difícil de lembrar e o cliente desconfia mais" });
    }
    const ruins = new Set((a?.verificacoes ?? []).filter((v) => v.ok === false).map((v) => v.id));
    for (const id of ORDEM) if (ruins.has(id) && TRADUCAO[id]) fatos.push(TRADUCAO[id]);
    const BOM: Record<string, string> = { mobile: "funciona bem no celular", https: "é seguro", rapido: "carrega rápido", whatsapp: "tem botão de WhatsApp" };
    for (const v of a?.verificacoes ?? []) if (v.ok === true && BOM[v.id]) pontosFortes.push(BOM[v.id]);
  }

  return {
    presenca,
    fatos: fatos.slice(0, 5),
    pontosFortes,
    canais,
    hipoteses: (q?.problemas ?? []).filter((p) => p.tipo === "hipotese").map((p) => p.descricao).slice(0, 3),
    oportunidades: (q?.oportunidades ?? []).map((p) => p.descricao).slice(0, 3),
    resumoAnalise: q?.justificativa?.replace(/^\[Análise simulada[^\]]*\]\s*/, "").slice(0, 500) ?? null,
    incerto: l.presenca === "sem_site_identificado" && l.presencaConfianca === "baixa",
  };
}

/** Texto do diagnóstico para o prompt do agente. */
export function diagnosticoParaAgente(d: Diagnostico): string {
  return [
    `Presença na internet: ${d.presenca}`,
    d.incerto && "ATENÇÃO: não temos certeza de que não há site (poucas fontes). PERGUNTE se a empresa tem site; não afirme que não tem.",
    d.fatos.length && `Fatos verificados (com o impacto para o negócio dele):\n${d.fatos.map((f) => `- ${f.fato} → ${f.impacto}`).join("\n")}`,
    d.pontosFortes.length && `O que já está bom (reconheça se fizer sentido): ${d.pontosFortes.join(", ")}`,
    d.canais.length && `Canais que a empresa usa: ${d.canais.join(", ")}`,
    d.hipoteses.length && `Hipóteses (NÃO afirme; no máximo pergunte): ${d.hipoteses.join("; ")}`,
    d.oportunidades.length && `Oportunidades que vemos (hipóteses): ${d.oportunidades.join("; ")}`,
    d.resumoAnalise && `Resumo da análise: ${d.resumoAnalise}`,
  ]
    .filter(Boolean)
    .join("\n");
}

/** Como usar o diagnóstico na conversa. Vai junto das regras do agente. */
export const COMO_USAR_DIAGNOSTICO = `COMO USAR O DIAGNÓSTICO DA EMPRESA (seção LEAD):
- Você já estudou a empresa: use isso como um consultor, não como um vendedor de lista.
- Traga UM ponto por vez, o mais relevante para o que o cliente acabou de dizer. Nunca despeje a lista de problemas.
- Fale do IMPACTO no negócio dele (clientes que desistem, não aparecer no Google), não de termos técnicos ("meta viewport", "HTTPS", "SEO").
- Prefira perguntar a afirmar: "vocês recebem muito cliente pelo Google?" abre mais conversa que "seu site é ruim".
- Reconheça o que já é bom antes de apontar o que falta. Nunca critique de forma dura nem faça o cliente se sentir julgado.
- Se o cliente perguntar como você sabe, diga com naturalidade que deu uma olhada na presença da empresa na internet.
- Use os fatos para responder objeções (ex.: "já tenho Instagram" → o que o Instagram não resolve sozinho, com base no diagnóstico).
- Sem forçar: se o ponto não tem relação com o momento da conversa, não use.`;

/**
 * Frase de abertura do primeiro contato a partir do fato mais forte. Montada por regras (sem IA).
 * Sempre factual; quando não há certeza, vira pergunta.
 */
export function ganchoPrimeiroContato(l: LeadDiagnostico): string {
  const d = diagnosticar(l);
  if (l.presenca === "sem_site_identificado") {
    return d.incerto
      ? "Procurei a empresa de vocês no Google e não encontrei um site próprio."
      : "Procurei a empresa de vocês no Google e vi que ainda não têm um site próprio.";
  }
  if (l.presenca === "so_rede_social") {
    const rede = d.canais.find((c) => c !== "WhatsApp") ?? "rede social";
    return `Vi que vocês atendem pelo ${rede}, mas ainda não têm um site próprio.`;
  }
  if (l.presenca === "site_fora_do_ar") return "Tentei acessar o site de vocês e ele não está abrindo.";
  const principal = d.fatos[0];
  if (principal) return `Dei uma olhada no site de vocês e notei que ${principal.fato}.`;
  return "Dei uma olhada na presença de vocês na internet.";
}
