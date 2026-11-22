import { beforeEach, describe, expect, it } from "vitest";
import { excluirBusca, pesquisaIgual, PesquisaDuplicada, criarBusca, previaExclusao, refazerBusca } from "../src/core/busca";
import { salvarConfig } from "../src/core/config";
import { garantirEtapas, idEtapa } from "../src/core/crm/etapas";
import { db } from "../src/core/db";
import { limparBanco } from "./ajuda";

beforeEach(async () => {
  await limparBanco();
  await garantirEtapas();
});

async function lead(nome: string, extra: Record<string, unknown> = {}) {
  return db.lead.create({ data: { nome, nomeNormalizado: nome.toLowerCase(), etapaId: await idEtapa("qualificado"), ...extra } });
}

describe("excluir pesquisa", () => {
  it("apaga só as empresas desta pesquisa ainda não contatadas; mantém as outras e o histórico de gastos", async () => {
    const b = await db.busca.create({ data: { nicho: "Pizzaria", cidade: "Guarujá", fontes: '["osm"]' } });
    const outra = await db.busca.create({ data: { nicho: "Lanches", cidade: "Guarujá", fontes: '["osm"]' } });
    const so = await lead("Só desta");
    const compartilhada = await lead("Das duas");
    const negociando = await lead("Negociando", { etapaId: await idEtapa("em_negociacao") });
    const autorizada = await lead("Autorizada", { contatoStatus: "autorizado" });
    for (const l of [so, compartilhada, negociando, autorizada]) await db.buscaLead.create({ data: { buscaId: b.id, leadId: l.id } });
    await db.buscaLead.create({ data: { buscaId: outra.id, leadId: compartilhada.id } });
    await db.registroCusto.create({ data: { categoria: "ia", provedor: "openai", operacao: "qualificacao", custoUsd: 0.01, buscaId: b.id, leadId: so.id } });

    expect(await previaExclusao(b.id)).toEqual({ empresas: 1 });
    expect(await excluirBusca(b.id)).toEqual({ empresasApagadas: 1 });

    expect(await db.busca.findUnique({ where: { id: b.id } })).toBeNull();
    expect((await db.lead.findMany({ orderBy: { nome: "asc" } })).map((l) => l.nome)).toEqual(["Autorizada", "Das duas", "Negociando"]);
    expect(await db.registroCusto.count()).toBe(1); // gasto continua no histórico
    expect(await db.buscaLead.count({ where: { buscaId: outra.id } })).toBe(1);
  });
});

describe("pesquisa única e refazer do zero", () => {
  it("bloqueia criar pesquisa igual (mesmo segmento e cidade, ignorando acento e caixa)", async () => {
    await salvarConfig("prospeccao", { fontes: { osm: { ativa: true } } });
    await criarBusca({ nicho: "Salões de beleza", cidade: "Guarujá, SP" }, null);
    expect(await pesquisaIgual("saloes de BELEZA", "guaruja sp")).not.toBeNull();
    await expect(criarBusca({ nicho: "saloes de beleza ", cidade: "Guaruja, SP" }, null)).rejects.toThrow(PesquisaDuplicada);
    await expect(criarBusca({ nicho: "Barbearia", cidade: "Guarujá, SP" }, null)).resolves.toBeTruthy();
  });

  it("refazer apaga as empresas não contatadas desta pesquisa e desliga as demais", async () => {
    await salvarConfig("prospeccao", { fontes: { osm: { ativa: true } } });
    const b = await db.busca.create({ data: { nicho: "Pizzaria", cidade: "Guarujá", fontes: '["osm"]', status: "concluida" } });
    const so = await lead("Só desta");
    const negociando = await lead("Negociando", { etapaId: await idEtapa("em_negociacao") });
    for (const l of [so, negociando]) await db.buscaLead.create({ data: { buscaId: b.id, leadId: l.id } });
    expect(await refazerBusca(b.id)).toEqual({ empresasApagadas: 1 });
    expect((await db.lead.findMany()).map((l) => l.nome)).toEqual(["Negociando"]);
    expect(await db.buscaLead.count({ where: { buscaId: b.id } })).toBe(0);
    expect((await db.busca.findUniqueOrThrow({ where: { id: b.id } })).status).toBe("pendente");
  });
});
