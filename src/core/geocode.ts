// Cidade -> coordenadas e bbox pelo Nominatim (OpenStreetMap). Gratuito e sem chave.
// Política de uso: no máximo 1 requisição por segundo e User-Agent que identifique o app.
// https://operations.osmfoundation.org/policies/nominatim/

import { USER_AGENT } from "./http-cliente";

/** [sul, norte, oeste, leste], no formato do Nominatim. */
export type Bbox = [number, number, number, number];

export interface Local {
  lat: number;
  lon: number;
  bbox: Bbox;
  nome: string;
  uf?: string;
}

let ultimaChamada = 0;
const cache = new Map<string, Local | null>();

const UFS: Record<string, string> = {
  acre: "AC", alagoas: "AL", amapá: "AP", amazonas: "AM", bahia: "BA", ceará: "CE", "distrito federal": "DF",
  "espírito santo": "ES", goiás: "GO", maranhão: "MA", "mato grosso": "MT", "mato grosso do sul": "MS",
  "minas gerais": "MG", pará: "PA", paraíba: "PB", paraná: "PR", pernambuco: "PE", piauí: "PI",
  "rio de janeiro": "RJ", "rio grande do norte": "RN", "rio grande do sul": "RS", rondônia: "RO", roraima: "RR",
  "santa catarina": "SC", "são paulo": "SP", sergipe: "SE", tocantins: "TO",
};

let substituto: ((lugar: string) => Promise<Local | null>) | null = null;

/** Só para testes. */
export function definirGeocoder(f: ((lugar: string) => Promise<Local | null>) | null): void {
  substituto = f;
}

export async function geocodificar(lugar: string): Promise<Local | null> {
  if (substituto) return substituto(lugar);
  const chave = lugar.trim().toLowerCase();
  if (cache.has(chave)) return cache.get(chave)!;

  const espera = ultimaChamada + 1100 - Date.now();
  if (espera > 0) await new Promise((r) => setTimeout(r, espera));
  ultimaChamada = Date.now();

  const q = new URLSearchParams({
    format: "json",
    limit: "1",
    q: lugar,
    countrycodes: "br",
    addressdetails: "1",
    "accept-language": "pt-BR",
  });
  const res = await fetch(`https://nominatim.openstreetmap.org/search?${q}`, {
    headers: { "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`Nominatim respondeu HTTP ${res.status}`);
  const hits = (await res.json()) as Array<{
    lat: string;
    lon: string;
    boundingbox: string[];
    display_name: string;
    address?: { state?: string };
  }>;
  const h = hits[0];
  const local = h
    ? {
        lat: Number(h.lat),
        lon: Number(h.lon),
        bbox: h.boundingbox.map(Number) as Bbox,
        nome: h.display_name,
        uf: h.address?.state ? UFS[h.address.state.toLowerCase()] : undefined,
      }
    : null;
  cache.set(chave, local);
  return local;
}
