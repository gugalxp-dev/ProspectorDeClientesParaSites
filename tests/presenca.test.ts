import { describe, expect, it } from "vitest";
import { classificarWebsite, dominioRegistravel, hostDe } from "../src/core/presenca";

describe("classificarWebsite", () => {
  it("vazio é sem site", () => {
    expect(classificarWebsite("")).toEqual({ presenca: "sem_site_identificado" });
    expect(classificarWebsite(undefined)).toEqual({ presenca: "sem_site_identificado" });
  });

  it("Instagram no campo website é só rede social", () => {
    expect(classificarWebsite("https://www.instagram.com/barbeariadoze/")).toEqual({
      presenca: "so_rede_social",
      rede: "instagram",
    });
  });

  it("Facebook mobile e linktree também", () => {
    expect(classificarWebsite("http://m.facebook.com/padaria").rede).toBe("facebook");
    expect(classificarWebsite("linktr.ee/salao")).toEqual({ presenca: "so_rede_social" });
  });

  it("site do Google Meu Negócio (desligado em 2024) conta como fora do ar", () => {
    expect(classificarWebsite("https://padaria-sp.negocio.site/").presenca).toBe("site_fora_do_ar");
    expect(classificarWebsite("https://foo.business.site").presenca).toBe("site_fora_do_ar");
  });

  it("domínio próprio é com site", () => {
    expect(classificarWebsite("www.clinicasorriso.com.br")).toEqual({ presenca: "com_site" });
  });

  it("não confunde domínio parecido com rede social", () => {
    expect(classificarWebsite("https://meuinstagram.com.br").presenca).toBe("com_site");
  });
});

describe("hostDe", () => {
  it("tira www e aceita URL sem protocolo", () => {
    expect(hostDe("www.Exemplo.com.br/contato")).toBe("exemplo.com.br");
  });
});

describe("dominioRegistravel", () => {
  it("entende sufixos .com.br e subdomínios", () => {
    expect(dominioRegistravel("loja.com.br")).toBe("loja.com.br");
    expect(dominioRegistravel("agenda.loja.com.br")).toBe("loja.com.br");
    expect(dominioRegistravel("app.exemplo.com")).toBe("exemplo.com");
    expect(dominioRegistravel("exemplo.com")).toBe("exemplo.com");
  });

  it("perfil do Google e plataforma de agendamento não são site próprio", () => {
    expect(classificarWebsite("https://business.google.com/v/barbearia-x/").presenca).toBe("so_rede_social");
    expect(classificarWebsite("https://www.cashbarber.com.br/goldmustache").presenca).toBe("so_rede_social");
  });
});
