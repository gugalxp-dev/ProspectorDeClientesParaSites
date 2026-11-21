// Fonte opcional: Google Places API (New), Text Search. Oficial, mas PAGA por requisição.
// https://developers.google.com/maps/documentation/places/web-service/text-search

import { obterConfig } from "../config";
import { db } from "../db";
import { credencial } from "../segredos";
import type { LugarBruto } from "../tipos";
import { FonteIndisponivel, type FonteDescoberta } from "./tipos";

const CAMPOS = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.location",
  "places.googleMapsUri",
  "places.primaryTypeDisplayName",
  "places.businessStatus",
  "places.internationalPhoneNumber",
  "places.nationalPhoneNumber",
  "places.websiteUri",
  "nextPageToken",
].join(",");

interface PlaceApi {
  id: string;
  displayName?: { text: string };
  formattedAddress?: string;
  location?: { latitude: number; longitude: number };
  googleMapsUri?: string;
  primaryTypeDisplayName?: { text: string };
  businessStatus?: string;
  internationalPhoneNumber?: string;
  nationalPhoneNumber?: string;
  websiteUri?: string;
}

export function placeParaLugar(p: PlaceApi, cidade: string): LugarBruto | null {
  if (!p.id || !p.displayName?.text) return null;
  return {
    fonte: "places",
    idExterno: p.id,
    nome: p.displayName.text,
    categoria: p.primaryTypeDisplayName?.text,
    endereco: p.formattedAddress,
    cidade,
    lat: p.location?.latitude,
    lon: p.location?.longitude,
    url: p.googleMapsUri,
    telefone: p.internationalPhoneNumber ?? p.nationalPhoneNumber,
    website: p.websiteUri,
    ativo: p.businessStatus !== "CLOSED_PERMANENTLY",
  };
}

export const fontePlaces: FonteDescoberta = {
  id: "places",
  nome: "Google Places API (oficial, paga)",
  descricao: "API oficial do Google. Exige chave e cobra por requisição (até 3 por busca).",
  aviso: "Serviço pago do Google Cloud.",
  gratuita: false,
  async disponivel() {
    return (await credencial("GOOGLE_PLACES_API_KEY")) ? { ok: true } : { ok: false, motivo: "GOOGLE_PLACES_API_KEY não configurada." };
  },
  async descobrir(p) {
    const chave = await credencial("GOOGLE_PLACES_API_KEY");
    if (!chave) throw new Error("GOOGLE_PLACES_API_KEY não configurada.");
    const lugares: LugarBruto[] = [];
    let pageToken: string | undefined;
    const { custoPlacesPorRequisicaoUsd } = await obterConfig("prospeccao");
    for (let pagina = 0; pagina < 3 && lugares.length < p.max; pagina++) {
      const inicio = Date.now();
      const r = await fetch("https://places.googleapis.com/v1/places:searchText", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Goog-Api-Key": chave, "X-Goog-FieldMask": CAMPOS },
        body: JSON.stringify({
          textQuery: `${p.nicho} em ${p.cidade}`,
          languageCode: "pt-BR",
          regionCode: "BR",
          pageSize: 20,
          locationBias: { circle: { center: { latitude: p.local.lat, longitude: p.local.lon }, radius: 30_000 } },
          ...(pageToken ? { pageToken } : {}),
        }),
        signal: AbortSignal.timeout(30_000),
      });
      // Toda requisição respondida é cobrada pelo Google, então registra antes de olhar o status.
      await db.registroCusto.create({
        data: {
          categoria: "descoberta",
          provedor: "google_places",
          modelo: "text_search",
          operacao: "descoberta",
          custoUsd: custoPlacesPorRequisicaoUsd,
          sucesso: r.ok,
          erro: r.ok ? null : `HTTP ${r.status}`,
          latenciaMs: Date.now() - inicio,
          buscaId: p.buscaId ?? null,
        },
      });
      if (r.status === 429 || r.status >= 500) throw new FonteIndisponivel(`Places API respondeu HTTP ${r.status}.`);
      if (!r.ok) throw new Error(`Places API respondeu HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
      const dados = (await r.json()) as { places?: PlaceApi[]; nextPageToken?: string };
      for (const place of dados.places ?? []) {
        const l = placeParaLugar(place, p.cidade);
        if (l) lugares.push(l);
      }
      pageToken = dados.nextPageToken;
      if (!pageToken) break;
    }
    return lugares;
  },
};
