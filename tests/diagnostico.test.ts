import { describe, expect, it } from "vitest";
import { diagnosticar, diagnosticoParaAgente, ganchoPrimeiroContato, type LeadDiagnostico } from "../src/core/agente/diagnostico";

const base: LeadDiagnostico = { nome: "Escuna X", presenca: "com_site", presencaConfianca: "alta", website: "https://escunax.com.br", siteAvaliacao: null, qualificacao: null, instagram: null, facebook: null, whatsappE164: null };
const avaliacao = (falhas: string[]) =>
  JSON.stringify({ online: true, verificacoes: ["mobile", "https", "whatsapp", "rapido"].map((id) => ({ id, rotulo: id, ok: !falhas.includes(id), peso: "alto" })), problemas: [] });

describe("diagnóstico para a conversa", () => {
  it("traduz problema técnico em impacto para o dono, sem jargão", () => {
    const d = diagnosticar({ ...base, siteAvaliacao: avaliacao(["mobile", "whatsapp"]) });
    expect(d.fatos.map((f) => f.fato)).toEqual(["o site não é adaptado para celular", "o site não tem botão de WhatsApp"]);
    expect(d.pontosFortes).toEqual(["é seguro", "carrega rápido"]);
    const texto = diagnosticoParaAgente(d);
    expect(texto).toContain("→");
    expect(texto).not.toMatch(/viewport/);
  });

  it("gancho do primeiro contato usa o fato mais forte e vira pergunta quando não há certeza", () => {
    expect(ganchoPrimeiroContato({ ...base, siteAvaliacao: avaliacao(["mobile"]) })).toBe("Dei uma olhada no site de vocês e notei que o site não é adaptado para celular.");
    expect(ganchoPrimeiroContato({ ...base, presenca: "so_rede_social", website: null, instagram: "https://instagram.com/x" })).toBe("Vi que vocês atendem pelo Instagram, mas ainda não têm um site próprio.");
    expect(ganchoPrimeiroContato({ ...base, presenca: "sem_site_identificado", presencaConfianca: "media", website: null })).toMatch(/ainda não têm um site/);
    // pouca confiança: não afirma que não tem site
    const incerto = diagnosticar({ ...base, presenca: "sem_site_identificado", presencaConfianca: "baixa", website: null });
    expect(incerto.incerto).toBe(true);
    expect(diagnosticoParaAgente(incerto)).toMatch(/PERGUNTE/);
    expect(ganchoPrimeiroContato({ ...base, presenca: "sem_site_identificado", presencaConfianca: "baixa", website: null })).toMatch(/não encontrei/);
  });

  it("site em plataforma gratuita vira argumento (sem domínio próprio)", () => {
    const d = diagnosticar({ ...base, website: "https://al-turismo.ueniweb.com/", siteAvaliacao: avaliacao([]) });
    expect(d.fatos[0].fato).toMatch(/endereço gratuito/);
    expect(diagnosticar({ ...base, siteAvaliacao: avaliacao([]) }).fatos).toEqual([]);
  });
});
