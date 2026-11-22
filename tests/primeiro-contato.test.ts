import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { salvarConfig } from "../src/core/config";
import { garantirEtapas, idEtapa } from "../src/core/crm/etapas";
import { db } from "../src/core/db";
import { forcarClienteWhatsApp, type ClienteWhatsApp } from "../src/core/whatsapp/cliente";
import { iniciarContato } from "../src/core/whatsapp/conversas";
import { limparBanco } from "./ajuda";

beforeEach(async () => {
  await limparBanco();
  await garantirEtapas();
});
afterEach(() => forcarClienteWhatsApp(null));

describe("primeiro contato (Baileys)", () => {
  it("monta o texto com agente, empresa, gancho e site sem estragar nenhuma palavra", async () => {
    let enviado = "";
    forcarClienteWhatsApp({
      modo: "baileys",
      enviarTexto: async () => ({ id: "x" }),
      enviarTemplate: async (_p: string, _n: string, _i: string, _par: string[], texto?: string) => {
        enviado = texto ?? "";
        return { id: "m1" };
      },
      estado: async () => ({ ok: true, detalhe: "" }),
    } as ClienteWhatsApp);
    await salvarConfig("agente", {
      nomeAgente: "Gus",
      nomeEmpresa: "TechNino Soluções",
      siteEmpresa: "https://technino.vercel.app/",
      mensagemPrimeiroContato: "Olá! Tudo bem? Aqui é {agente}, da {empresa}. {gancho} Trabalhamos com sites para empresas como a {nome}. Veja: {site} Posso te mostrar uma ideia rápida?",
    });
    const lead = await db.lead.create({
      data: {
        nome: "Empresa Teste", nomeNormalizado: "empresa teste", telefoneE164: "+5513996369053", ehCelular: true,
        presenca: "so_rede_social", instagram: "https://instagram.com/empresateste", etapaId: await idEtapa("qualificado"),
      },
    });
    await iniciarContato(lead.id, "u1");
    expect(enviado).toBe(
      "Olá! Tudo bem? Aqui é Gus, da TechNino Soluções. Vi que vocês atendem pelo Instagram, mas ainda não têm um site próprio. " +
        "Trabalhamos com sites para empresas como a Empresa Teste. Veja: https://technino.vercel.app/ Posso te mostrar uma ideia rápida?",
    );
  });
});
