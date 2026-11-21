import { afterEach, describe, expect, it } from "vitest";
import { definirRedeDescobertaSite, descobrirSite, slugs } from "../src/core/prospeccao/descobrirSite";
import { fetchFalso } from "./ajuda";

afterEach(() => definirRedeDescobertaSite(null, null));

describe("descoberta do site oficial pelo nome", () => {
  it("gera domínios prováveis e não arrisca nomes só com palavras genéricas", () => {
    expect(slugs("Vila das Patas", "Praia Grande")).toEqual(["viladaspatas.com.br", "viladaspatas.com", "vila-das-patas.com.br", "vila-das-patas.com", "viladaspataspraiagrande.com.br"]);
    expect(slugs("Pet Shop Center")).toEqual(expect.arrayContaining(["petshopcenter.com.br"]));
    expect(slugs("Pet Shop")).toEqual([]);
  });

  it("aceita só quando a página confirma nome e cidade (ou telefone)", async () => {
    definirRedeDescobertaSite(
      fetchFalso({ "https://viladaspatas.com.br": "<title>Vila das Patas</title> Banho e tosa em Praia Grande - SP" }),
      async (d) => d === "viladaspatas.com.br",
    );
    const r = await descobrirSite({ nome: "Vila das Patas", cidade: "Praia Grande", telefoneE164: null });
    expect(r).toMatchObject({ confirmado: true });
    expect(r!.url).toContain("viladaspatas.com.br");
  });

  it("domínio de outra cidade vira só 'possível site', nunca confirmado", async () => {
    definirRedeDescobertaSite(fetchFalso({ "https://ticotico.com.br": "<title>Tico Tico</title> Escola infantil em Curitiba" }), async (d) => d === "ticotico.com.br");
    const r = await descobrirSite({ nome: "Tico Tico", cidade: "Praia Grande", telefoneE164: "+5513988887777" });
    expect(r).toMatchObject({ confirmado: false });
  });

  it("sem domínio registrado, não encontra nada", async () => {
    definirRedeDescobertaSite(fetchFalso({}), async () => false);
    expect(await descobrirSite({ nome: "Loja Inexistente Xyz", cidade: "Santos", telefoneE164: null })).toBeNull();
  });
});
