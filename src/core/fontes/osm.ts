// Fonte padrão: OpenStreetMap via Overpass API. Gratuita, sem chave, dados abertos (ODbL).
// Uso permitido com atribuição e volume moderado: https://wiki.openstreetmap.org/wiki/Overpass_API#Public_Overpass_API_instances
// A cobertura varia por cidade: o OSM costuma ter menos negócios que o Google, mas muitos já vêm com telefone e site.

import { USER_AGENT } from "../http-cliente";
import type { LugarBruto } from "../tipos";
import { FonteIndisponivel, type FonteDescoberta, type ParametrosDescoberta } from "./tipos";

const SERVIDORES = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"];

/** Segmento (sem acento, minúsculo) -> filtros de tags do OSM. A busca por nome complementa. */
const SEGMENTOS: Array<{ termos: string[]; tags: string[] }> = [
  { termos: ["pet shop", "petshop", "pet"], tags: ['["shop"="pet"]', '["shop"="pet_grooming"]'] },
  { termos: ["veterinari", "clinica veterinaria"], tags: ['["amenity"="veterinary"]'] },
  { termos: ["salao de beleza", "salao", "cabeleireir", "cabelo"], tags: ['["shop"="hairdresser"]', '["shop"="beauty"]'] },
  { termos: ["barbearia", "barbeiro"], tags: ['["shop"="hairdresser"]["male"="yes"]', '["shop"="barber"]', '["hairdresser"="barber"]'] },
  { termos: ["manicure", "estetica", "clinica de estetica", "depilacao", "sobrancelha", "unha", "cilios", "spa"], tags: ['["shop"="beauty"]', '["shop"="cosmetics"]', '["leisure"="spa"]', '["amenity"="clinic"]["healthcare:speciality"~"dermatology|aesthetic"]'] },
  { termos: ["restaurante", "restaurant"], tags: ['["amenity"="restaurant"]'] },
  { termos: ["pizzaria", "pizza"], tags: ['["amenity"="restaurant"]["cuisine"~"pizza"]', '["amenity"="fast_food"]["cuisine"~"pizza"]'] },
  { termos: ["lanchonete", "hamburgueria", "hamburguer", "fast food", "lanche"], tags: ['["amenity"="fast_food"]'] },
  { termos: ["pastel", "pastelaria", "salgado", "salgaderia", "coxinha"], tags: ['["amenity"="fast_food"]["cuisine"~"pastel|brazilian|savory|snack",i]', '["shop"="pastry"]'] },
  { termos: ["marmita", "marmitaria", "self service", "comida caseira", "quentinha"], tags: ['["amenity"="restaurant"]["cuisine"~"brazilian|regional|buffet",i]'] },
  { termos: ["japones", "sushi", "temaki"], tags: ['["amenity"="restaurant"]["cuisine"~"japanese|sushi",i]'] },
  { termos: ["churrascaria", "churrasco", "espetinho"], tags: ['["amenity"="restaurant"]["cuisine"~"barbecue|steak",i]'] },
  { termos: ["padaria", "panificadora"], tags: ['["shop"="bakery"]'] },
  { termos: ["confeitaria", "doceria", "doces", "bolos"], tags: ['["shop"="confectionery"]', '["shop"="pastry"]'] },
  { termos: ["cafeteria", "cafe"], tags: ['["amenity"="cafe"]'] },
  { termos: ["bar", "boteco", "pub"], tags: ['["amenity"="bar"]', '["amenity"="pub"]'] },
  { termos: ["sorveteria", "acai"], tags: ['["amenity"="ice_cream"]', '["shop"="ice_cream"]'] },
  { termos: ["acougue"], tags: ['["shop"="butcher"]'] },
  { termos: ["mercado", "supermercado", "mercearia"], tags: ['["shop"="supermarket"]', '["shop"="convenience"]'] },
  { termos: ["hortifruti", "sacolao", "quitanda"], tags: ['["shop"="greengrocer"]'] },
  { termos: ["farmacia", "drogaria"], tags: ['["amenity"="pharmacy"]'] },
  { termos: ["dentista", "odontolog", "clinica odontologica"], tags: ['["amenity"="dentist"]', '["healthcare"="dentist"]'] },
  { termos: ["clinica medica", "clinica", "consultorio medico", "medico"], tags: ['["amenity"="clinic"]', '["amenity"="doctors"]'] },
  { termos: ["saude"], tags: ['["amenity"="clinic"]', '["amenity"="doctors"]', '["amenity"="dentist"]', '["healthcare"~"physiotherapist|psychotherapist|laboratory|optometrist|podiatrist|nutritionist|speech_therapist"]'] },
  { termos: ["nutricionista", "nutricao"], tags: ['["healthcare"="nutritionist"]', '["healthcare:speciality"~"nutrition"]'] },
  { termos: ["fisioterapia", "fisioterapeuta"], tags: ['["healthcare"="physiotherapist"]'] },
  { termos: ["psicolog"], tags: ['["healthcare"="psychotherapist"]', '["healthcare:speciality"="psychology"]'] },
  { termos: ["laboratorio", "exames"], tags: ['["healthcare"="laboratory"]'] },
  { termos: ["academia", "crossfit", "pilates"], tags: ['["leisure"="fitness_centre"]', '["leisure"="sports_centre"]'] },
  { termos: ["escola", "colegio"], tags: ['["amenity"="school"]'] },
  { termos: ["creche", "bercario"], tags: ['["amenity"="kindergarten"]', '["amenity"="childcare"]'] },
  { termos: ["curso", "idiomas", "escola de ingles"], tags: ['["amenity"="language_school"]', '["office"="educational_institution"]'] },
  { termos: ["autoescola", "auto escola", "cfc"], tags: ['["amenity"="driving_school"]'] },
  { termos: ["oficina", "mecanica", "auto center"], tags: ['["shop"="car_repair"]'] },
  { termos: ["autopecas", "auto pecas"], tags: ['["shop"="car_parts"]'] },
  { termos: ["lava rapido", "lava jato", "estetica automotiva", "lavagem automotiva"], tags: ['["amenity"="car_wash"]'] },
  { termos: ["borracharia", "pneus"], tags: ['["shop"="tyres"]'] },
  { termos: ["imobiliaria"], tags: ['["office"="estate_agent"]'] },
  { termos: ["advogad", "advocacia", "escritorio de advocacia"], tags: ['["office"="lawyer"]'] },
  { termos: ["contabilidade", "contador", "escritorio contabil"], tags: ['["office"="accountant"]'] },
  { termos: ["arquitet"], tags: ['["office"="architect"]'] },
  { termos: ["floricultura", "flores"], tags: ['["shop"="florist"]'] },
  { termos: ["otica"], tags: ['["shop"="optician"]'] },
  { termos: ["joalheria", "relojoaria"], tags: ['["shop"="jewelry"]', '["shop"="watches"]'] },
  { termos: ["papelaria"], tags: ['["shop"="stationery"]'] },
  { termos: ["livraria"], tags: ['["shop"="books"]'] },
  { termos: ["loja de roupas", "roupas", "moda", "boutique"], tags: ['["shop"="clothes"]', '["shop"="boutique"]'] },
  { termos: ["calcados", "sapataria"], tags: ['["shop"="shoes"]'] },
  { termos: ["moveis", "loja de moveis"], tags: ['["shop"="furniture"]'] },
  { termos: ["material de construcao", "materiais de construcao", "ferragens"], tags: ['["shop"="hardware"]', '["shop"="doityourself"]', '["shop"="trade"]'] },
  { termos: ["informatica", "computador", "eletronicos"], tags: ['["shop"="computer"]', '["shop"="electronics"]'] },
  { termos: ["celular", "assistencia tecnica"], tags: ['["shop"="mobile_phone"]', '["craft"="electronics_repair"]'] },
  { termos: ["hotel", "pousada", "hostel"], tags: ['["tourism"="hotel"]', '["tourism"="guest_house"]', '["tourism"="hostel"]'] },
  { termos: ["agencia de viagens"], tags: ['["shop"="travel_agency"]'] },
  { termos: ["lavanderia"], tags: ['["shop"="laundry"]', '["shop"="dry_cleaning"]'] },
  { termos: ["chaveiro"], tags: ['["shop"="locksmith"]', '["craft"="key_cutter"]'] },
  { termos: ["grafica"], tags: ['["shop"="copyshop"]', '["craft"="printer"]'] },
  { termos: ["fotografo", "fotografia"], tags: ['["craft"="photographer"]', '["shop"="photo"]'] },
  { termos: ["tatuagem", "tattoo", "estudio de tatuagem"], tags: ['["shop"="tattoo"]'] },
  { termos: ["buffet", "eventos", "festas"], tags: ['["amenity"="events_venue"]', '["shop"="party"]'] },
  { termos: ["servicos residenciais", "eletricista", "encanador", "pedreiro", "pintor", "marido de aluguel", "reformas", "dedetizacao", "jardinagem", "vidracaria", "marcenaria", "serralheria"], tags: ['["craft"~"electrician|plumber|builder|painter|carpenter|glaziery|metal_construction|gardener|hvac|tiler|roofer"]', '["shop"="pest_control"]', '["office"="construction_company"]'] },
  { termos: ["turismo", "passeio", "passeios", "receptivo"], tags: ['["shop"="travel_agency"]', '["office"="travel_agent"]', '["tourism"="information"]["information"="office"]'] },
];

export function semAcento(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

/** "saloes de beleza" -> "salao de beleza", "pet shops" -> "pet shop". */
export function singular(texto: string): string {
  return texto
    .split(" ")
    .map((w) => (w.length <= 3 ? w : w.replace(/oes$|aes$/, "ao").replace(/ais$/, "al").replace(/eis$/, "el").replace(/([^s])s$/, "$1")))
    .join(" ");
}

export function tagsDoSegmento(nicho: string): string[] {
  const n = ` ${singular(semAcento(nicho)).replace(/[^a-z0-9]+/g, " ").trim()} `;
  // O termo tem de aparecer na busca começando numa palavra ("odontolog" casa "odontologica").
  // Ao contrário não vale: "estetica" não pode puxar "estetica automotiva" (lava-rápido).
  const achados = SEGMENTOS.filter((s) => s.termos.map((t) => singular(t)).some((t) => n.includes(` ${t}`)));
  return [...new Set(achados.flatMap((s) => s.tags))];
}

/** Regex de nome que ignora acento: "estética" -> "est[eéèê]tica". Usa o singular ("pastéis" -> "pastel"). */
export function regexNome(nicho: string): string {
  const base = singular(semAcento(nicho)).replace(/[^a-z0-9 ]/g, "").trim().slice(0, 60);
  const classes: Record<string, string> = { a: "[aáàâã]", e: "[eéèê]", i: "[iíì]", o: "[oóòôõ]", u: "[uúùü]", c: "[cç]" };
  return base.replace(/[aeiouc]/g, (l) => classes[l]);
}

/** Escapa um texto para dentro de uma regex entre aspas do Overpass QL. */
function escaparRegex(s: string): string {
  return s.replace(/[\\"]/g, "").replace(/[.*+?^${}()|[\]]/g, "\\$&");
}

export function montarConsulta(nicho: string, bbox: [number, number, number, number], max: number): string {
  const [s, n, w, e] = bbox;
  const area = `(${s},${w},${n},${e})`;
  const filtros = tagsDoSegmento(nicho).map((t) => `  nwr${t}["name"]${area};`);
  const nome = regexNome(escaparRegex(nicho));
  if (nome) filtros.push(`  nwr["name"~"${nome}",i]${area};`);
  return `[out:json][timeout:90];\n(\n${filtros.join("\n")}\n);\nout center tags ${Math.max(1, Math.min(2000, max))};`;
}

interface ElementoOsm {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

const primeiro = (t: Record<string, string>, ...chaves: string[]) => {
  for (const c of chaves) if (t[c]?.trim()) return t[c].split(";")[0].trim();
  return undefined;
};

export function elementoParaLugar(el: ElementoOsm, cidadePadrao: string): LugarBruto | null {
  const t = el.tags ?? {};
  if (!t.name) return null;
  const rua = [t["addr:street"], t["addr:housenumber"]].filter(Boolean).join(", ");
  const endereco = [rua, t["addr:suburb"], t["addr:city"], t["addr:postcode"]].filter(Boolean).join(" - ") || undefined;
  const instagram = primeiro(t, "contact:instagram", "instagram");
  const facebook = primeiro(t, "contact:facebook", "facebook");
  const email = primeiro(t, "email", "contact:email");
  return {
    fonte: "osm",
    idExterno: `${el.type}/${el.id}`,
    nome: t.name.trim(),
    categoria: t.shop ?? t.amenity ?? t.office ?? t.healthcare ?? t.craft ?? t.leisure ?? t.tourism,
    endereco,
    cidade: t["addr:city"] ?? cidadePadrao,
    uf: t["addr:state"],
    lat: el.lat ?? el.center?.lat,
    lon: el.lon ?? el.center?.lon,
    url: `https://www.openstreetmap.org/${el.type}/${el.id}`,
    telefone: primeiro(t, "contact:whatsapp", "contact:mobile", "mobile", "phone", "contact:phone"),
    website: primeiro(t, "website", "contact:website", "url"),
    emails: email ? [email.toLowerCase()] : [],
    instagram: instagram ? (instagram.startsWith("http") ? instagram : `https://instagram.com/${instagram.replace(/^@/, "")}`) : undefined,
    facebook: facebook ? (facebook.startsWith("http") ? facebook : `https://facebook.com/${facebook}`) : undefined,
    rede: t.brand ?? (t["brand:wikidata"] ? t.name : undefined),
    ativo: !t["disused:shop"] && !t["was:shop"],
  };
}

let ultimaChamada = 0;

async function consultar(q: string): Promise<ElementoOsm[]> {
  let ultimoErro: unknown;
  for (const servidor of SERVIDORES) {
    // Educado com o servidor público: no máximo uma consulta a cada 2 segundos por processo.
    const espera = ultimaChamada + 2000 - Date.now();
    if (espera > 0) await new Promise((r) => setTimeout(r, espera));
    ultimaChamada = Date.now();
    try {
      const r = await fetch(servidor, {
        method: "POST",
        headers: { "User-Agent": USER_AGENT, "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ data: q }),
        signal: AbortSignal.timeout(120_000),
      });
      if (r.status === 429 || r.status === 504 || r.status >= 500) {
        ultimoErro = new FonteIndisponivel(`Overpass ocupado (HTTP ${r.status}).`);
        continue;
      }
      if (!r.ok) throw new Error(`Overpass respondeu HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
      const dados = (await r.json()) as { elements?: ElementoOsm[] };
      return dados.elements ?? [];
    } catch (e) {
      ultimoErro = (e as Error).name === "TimeoutError" ? new FonteIndisponivel("Overpass não respondeu a tempo.") : e;
    }
  }
  throw ultimoErro;
}

export const fonteOsm: FonteDescoberta = {
  id: "osm",
  nome: "OpenStreetMap (Overpass)",
  descricao: "Base aberta e gratuita. Sem chave e sem custo. Cobertura variável por cidade.",
  gratuita: true,
  async disponivel() {
    return { ok: true };
  },
  async descobrir(p: ParametrosDescoberta) {
    const elementos = await consultar(montarConsulta(p.nicho, p.local.bbox, p.max));
    return elementos.map((e) => elementoParaLugar(e, p.cidade)).filter((l): l is LugarBruto => l !== null);
  },
};
