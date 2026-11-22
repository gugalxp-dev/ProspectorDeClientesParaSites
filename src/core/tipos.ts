// Valores válidos dos campos de "tipo" do banco (o SQLite guarda como String).

export const PRESENCAS = ["sem_site_identificado", "so_rede_social", "site_fora_do_ar", "com_site"] as const;
export type Presenca = (typeof PRESENCAS)[number];

export const PRESENCA_ROTULO: Record<Presenca, string> = {
  sem_site_identificado: "Sem site identificado",
  so_rede_social: "Só rede social",
  site_fora_do_ar: "Site fora do ar",
  com_site: "Com site",
};

export const CONFIANCAS = ["baixa", "media", "alta"] as const;
export type Confianca = (typeof CONFIANCAS)[number];

export const STATUS_QUALIFICACAO = ["pendente", "analisando", "qualificado", "desqualificado", "erro"] as const;
export type StatusQualificacao = (typeof STATUS_QUALIFICACAO)[number];

export const STATUS_BUSCA = ["pendente", "descobrindo", "processando", "concluida", "falhou", "cancelada"] as const;
export type StatusBusca = (typeof STATUS_BUSCA)[number];

export const STATUS_BUSCA_ROTULO: Record<StatusBusca, string> = {
  pendente: "Na fila",
  descobrindo: "Descobrindo empresas",
  processando: "Analisando",
  concluida: "Concluída",
  falhou: "Falhou",
  cancelada: "Cancelada",
};

export const CONTATO_STATUS = ["sem_autorizacao", "autorizado", "opt_out"] as const;
export type ContatoStatus = (typeof CONTATO_STATUS)[number];

export const PAPEIS = ["admin", "operador"] as const;
export type Papel = (typeof PAPEIS)[number];

/** Etapas que as automações usam. O nome e a ordem podem ser editados no painel; a chave não. */
export const ETAPAS_PADRAO = [
  { chave: "novo", nome: "Novo lead", cor: "slate" },
  { chave: "em_analise", nome: "Em análise", cor: "sky" },
  { chave: "qualificado", nome: "Qualificado", cor: "indigo" },
  { chave: "aguardando_autorizacao", nome: "Aguardando autorização de contato", cor: "violet" },
  { chave: "contato_iniciado", nome: "Contato iniciado", cor: "blue" },
  { chave: "aguardando_resposta", nome: "Aguardando resposta", cor: "cyan" },
  { chave: "em_negociacao", nome: "Em negociação", cor: "amber" },
  { chave: "intervencao_humana", nome: "Aguardando intervenção humana", cor: "rose" },
  { chave: "fechado", nome: "Fechado", cor: "emerald" },
  { chave: "perdido", nome: "Perdido", cor: "zinc" },
] as const;
export type ChaveEtapa = (typeof ETAPAS_PADRAO)[number]["chave"];

/** Um lugar como vem de qualquer fonte de descoberta, já com os nossos nomes de campo. */
export interface LugarBruto {
  /** Fonte (osm, gmaps, places...) e id nela: a dupla é única. */
  fonte: string;
  idExterno: string;
  nome: string;
  categoria?: string;
  endereco?: string;
  cidade?: string;
  uf?: string;
  lat?: number;
  lon?: number;
  url?: string;
  telefone?: string;
  website?: string;
  emails?: string[];
  instagram?: string;
  facebook?: string;
  /** Marca da rede/franquia, quando a fonte informa (OSM: brand). */
  rede?: string;
  /** false quando a fonte marca o negócio como fechado. */
  ativo?: boolean;
}

export function ehUm<T extends readonly string[]>(lista: T, v: unknown): v is T[number] {
  return typeof v === "string" && (lista as readonly string[]).includes(v);
}
