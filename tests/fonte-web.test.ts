import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { garantirEtapas } from "../src/core/crm/etapas";
import { db } from "../src/core/db";
import { fonteWeb } from "../src/core/fontes/web";
import { importarLugares } from "../src/core/prospeccao/importar";
import { salvarCredencial } from "../src/core/segredos";
import { registrarClienteLocal, type ClienteWhatsApp } from "../src/core/whatsapp/cliente";
import { limparBanco } from "./ajuda";

const LOCAL = { lat: -23.99, lon: -46.25, bbox: [-24.1, -23.9, -46.4, -46.1] as [number, number, number, number], nome: "Guarujá" };

function respostaOpenAI(empresas: unknown[]) {
  return new Response(
    JSON.stringify({
      model: "gpt-4o-mini-2024-07-18",
      output: [
        { type: "web_search_call", status: "completed" },
        { type: "web_search_call", status: "completed" },
        { type: "message", content: [{ type: "output_text", text: "```json\n" + JSON.stringify({ empresas }) + "\n```" }] },
      ],
      usage: { input_tokens: 16000, output_tokens: 1000 },
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

beforeEach(async () => {
  await limparBanco();
  await garantirEtapas();
  await salvarCredencial("OPENAI_API_KEY", "sk-teste-0000000000000000", "u1");
});
afterEach(() => {
  vi.unstubAllGlobals();
  registrarClienteLocal(null);
});

describe("fonte: busca na internet (IA)", () => {
  it("converte a resposta em empresas e registra o custo (buscas + tokens)", async () => {
    const chamada = vi.fn(async (_url: string, _init?: RequestInit) =>
      respostaOpenAI([
        { nome: "Escuna Guarujá Passeios", telefone: "null", whatsapp: "(13) 99777-1234", instagram: "@escunaguaruja", site: "null", endereco: "Praia do Perequê", fonte: "https://maps.google.com/x" },
        { nome: "x" }, // inválido: nome curto demais, descartado
      ]),
    );
    vi.stubGlobal("fetch", chamada);
    const lugares = await fonteWeb.descobrir({ nicho: "turismo", cidade: "Guarujá", local: LOCAL, max: 50, buscaId: "b1" });
    expect(lugares).toHaveLength(1);
    expect(lugares[0]).toMatchObject({ fonte: "web", nome: "Escuna Guarujá Passeios", telefone: "(13) 99777-1234", instagram: "https://instagram.com/escunaguaruja" });
    expect(lugares[0].website).toBeUndefined(); // a palavra "null" não vira site
    expect(chamada).toHaveBeenCalledTimes(4); // 4 consultas diferentes (padrão), resultados juntados sem repetir
    const corpo = JSON.parse((chamada.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(corpo.tools[0].type).toBe("web_search");
    expect(corpo.max_tool_calls).toBe(2);
    expect(corpo.input).toContain("turismo em Guarujá");
    const custos = await db.registroCusto.findMany({ where: { operacao: "descoberta_web" } });
    expect(custos).toHaveLength(4);
    // por chamada: 2 buscas x US$ 0,01 + 16.000 entrada x 0,15/M + 1.000 saída x 0,60/M
    expect(custos[0].custoUsd).toBeCloseTo(0.02 + 0.0024 + 0.0006, 6);
  });

  it("telefone da IA que não existe no WhatsApp é descartado; o que existe vira WhatsApp do lead", async () => {
    registrarClienteLocal({ modo: "baileys", temWhatsApp: async (e164: string) => e164 === "+5513997771234" } as unknown as ClienteWhatsApp);
    const b = await db.busca.create({ data: { nicho: "turismo", cidade: "Guarujá", fontes: '["web"]' } });
    const r = await importarLugares(b.id, "turismo", "Guarujá", [
      { fonte: "web", idExterno: "a", nome: "Escuna Real", telefone: "(13) 99777-1234" },
      { fonte: "web", idExterno: "b", nome: "Escuna Inventada", telefone: "(13) 99111-0000" },
    ]);
    expect(r.novos).toBe(1);
    expect(await db.lead.findMany({ select: { nome: true, whatsappE164: true } })).toEqual([{ nome: "Escuna Real", whatsappE164: "+5513997771234" }]);
  });
});

describe("site informado pela busca por IA", () => {
  it("domínio inexistente (confirmado) vira 'sem site', não 'fora do ar'", async () => {
    const { processarLead } = await import("../src/core/prospeccao/processar");
    const l = await db.lead.create({
      data: { nome: "Toddy Turismo", nomeNormalizado: "toddy turismo", cidade: "Guarujá", website: "https://www.toddyturismo.com.br/", presenca: "com_site", telefoneE164: "+5513920005587", ehCelular: true },
    });
    await db.leadOrigem.create({ data: { leadId: l.id, fonte: "web", idExterno: "x1" } });
    const semDns = (async () => {
      throw Object.assign(new Error("fetch failed"), { cause: { code: "ENOTFOUND" } });
    }) as unknown as typeof fetch;
    await processarLead(l.id, null, { fetch: semDns, verificarDominio: async () => "inexistente" });
    const depois = await db.lead.findUniqueOrThrow({ where: { id: l.id } });
    expect(depois).toMatchObject({ presenca: "sem_site_identificado", website: null });
  });
});
