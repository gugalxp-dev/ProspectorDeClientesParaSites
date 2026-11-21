// Fonte opcional: motor gosom/google-maps-scraper em Docker (MIT, © Georgios Komninos).
// DESATIVADA por padrão: coletar dados do Google Maps com robô pode violar os Termos de Serviço do Google.
// Ative só se você avaliou o risco. Proxies para contornar bloqueio NÃO são suportados de propósito.
// Fluxo: POST /api/v1/jobs -> GET /api/v1/jobs/{id} até "ok" -> GET /api/v1/jobs/{id}/download (CSV).

import { parse } from "csv-parse/sync";
import { env } from "@/lib/env";
import type { LugarBruto } from "../tipos";
import { FonteIndisponivel, type FonteDescoberta } from "./tipos";

const motorUrl = () => env().MOTOR_URL.replace(/\/$/, "");
const TEMPO_MAXIMO_S = 900;

async function chamar(caminho: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(motorUrl() + caminho, { ...init, signal: AbortSignal.timeout(60_000) });
  } catch {
    throw new FonteIndisponivel(`Motor gosom fora do ar em ${motorUrl()}. Rode "docker compose up -d".`);
  }
}

const num = (v: string | undefined) => {
  if (!v) return undefined;
  const n = Number(v.replace(",", "."));
  return Number.isFinite(n) ? n : undefined;
};

export function linhaParaLugar(r: Record<string, string>, cidade: string): LugarBruto | null {
  const id = r.place_id || r.cid || r.link;
  if (!id || !r.title) return null;
  const nome = r.title.trim();
  const endereco = r.address?.startsWith(`${nome} - `) ? r.address.slice(nome.length + 3) : r.address;
  return {
    fonte: "gmaps",
    idExterno: id,
    nome,
    categoria: r.category || undefined,
    endereco: endereco || undefined,
    cidade,
    lat: num(r.latitude),
    lon: num(r.longitude),
    url: r.link || undefined,
    telefone: r.phone || undefined,
    website: r.website || undefined,
    emails: r.emails ? r.emails.split(",").map((e) => e.trim()).filter(Boolean) : [],
    ativo: !/permanently closed|fechado permanentemente/i.test(r.status ?? ""),
  };
}

export const fonteGmaps: FonteDescoberta = {
  id: "gmaps",
  nome: "Google Maps (motor gosom em Docker)",
  descricao: "Mais resultados, mas depende do Docker e de um robô que navega no Google Maps.",
  aviso: "Pode violar os Termos de Serviço do Google e levar a bloqueio do seu IP. Desativada por padrão.",
  gratuita: true,
  async disponivel() {
    try {
      const r = await fetch(`${motorUrl()}/api/v1/jobs`, { signal: AbortSignal.timeout(5000) });
      return r.ok ? { ok: true } : { ok: false, motivo: `Motor respondeu HTTP ${r.status}` };
    } catch {
      return { ok: false, motivo: "Motor gosom fora do ar (docker compose up -d)." };
    }
  },
  async descobrir(p) {
    const [s, n, w, e] = p.local.bbox;
    const raio = Math.min(50_000, Math.max(2000, Math.round(((n - s) * 111_000 + (e - w) * 111_000) / 3)));
    const r = await chamar("/api/v1/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "prospector",
        keywords: [`${p.nicho} em ${p.cidade}`],
        lang: "pt",
        zoom: 13,
        lat: String(p.local.lat),
        lon: String(p.local.lon),
        radius: raio,
        depth: 10,
        email: false,
        max_time: TEMPO_MAXIMO_S,
      }),
    });
    if (!r.ok) throw new Error(`Motor recusou o job (HTTP ${r.status}).`);
    const { id } = (await r.json()) as { id?: string };
    if (!id) throw new Error("Motor não devolveu o id do job.");

    const limite = Date.now() + (TEMPO_MAXIMO_S + 120) * 1000;
    try {
      while (Date.now() < limite) {
        await new Promise((ok) => setTimeout(ok, 10_000));
        const st = await chamar(`/api/v1/jobs/${id}`);
        const status = st.ok ? ((await st.json()) as { Status?: string }).Status : "failed";
        if (status === "failed") throw new Error("O job falhou no motor (possível bloqueio do Google).");
        if (status === "ok") {
          const csv = await (await chamar(`/api/v1/jobs/${id}/download`)).text();
          const linhas = parse(csv, { columns: true, skip_empty_lines: true, relax_column_count: true, bom: true }) as Array<Record<string, string>>;
          return linhas.map((l) => linhaParaLugar(l, p.cidade)).filter((l): l is LugarBruto => l !== null).slice(0, p.max);
        }
      }
      throw new Error("O job passou do tempo máximo no motor.");
    } finally {
      await chamar(`/api/v1/jobs/${id}`, { method: "DELETE" }).catch(() => undefined);
    }
  },
};
