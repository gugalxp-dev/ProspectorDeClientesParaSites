import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { salvarConfig } from "../src/core/config";
import { aceitar, contratoPorToken, dadosIniciais, ErroContrato, finalizar, enviarPorWhatsApp, linkPublico, pendenciasContrato, renderizar, salvarRascunho } from "../src/core/contratos";
import { garantirEtapas, idEtapa } from "../src/core/crm/etapas";
import { db } from "../src/core/db";
import { forcarClienteWhatsApp } from "../src/core/whatsapp/cliente";
import { payloadSimulado, receberEventos } from "../src/core/whatsapp/webhook";
import { obterConfig } from "../src/core/config";
import { limparBanco, rodarFila } from "./ajuda";

beforeEach(async () => {
  await limparBanco();
  await garantirEtapas();
  await db.servico.create({ data: { nome: "Site institucional", descricao: "Até 5 páginas", precoCentavos: 150000, prazoDias: 20 } });
  await salvarConfig("contrato", { contratadaNome: "Minha Agência", contratadaDocumento: "12.345.678/0001-90", cidade: "Santos" });
});
afterEach(() => forcarClienteWhatsApp(null));

async function criarLead() {
  return db.lead.create({
    data: { nome: "Pet Feliz", nomeNormalizado: "pet feliz", cidade: "Guarujá", telefoneE164: "+5513988887777", ehCelular: true, etapaId: await idEtapa("em_negociacao") },
  });
}

describe("contratos", () => {
  it("preenche o modelo único sem IA e aponta o que falta", async () => {
    const cfg = await obterConfig("contrato");
    const lead = await criarLead();
    const d = await dadosIniciais(lead.id);
    expect(d).toMatchObject({ contratanteNome: "Pet Feliz", servico: "Site institucional", valorCentavos: 150000, prazoDias: 20 });
    expect(pendenciasContrato(d, cfg)).toEqual(["CPF (11 dígitos) ou CNPJ (14 dígitos) do contratante"]);
    const texto = renderizar(cfg.modelo, "2026-0001", d, cfg);
    expect(texto).toContain("Minha Agência");
    expect(texto.replace(/\s/g, " ")).toContain("R$ 1.500,00");
    expect(texto).toContain("20 dias");
    expect(texto).not.toMatch(/\{\{/);
    expect(await db.registroCusto.count()).toBe(0); // nenhuma chamada de IA
  });

  it("fluxo completo: rascunho -> finaliza -> envia -> cliente abre o link e aceita -> lead fechado", async () => {
    const lead = await criarLead();
    await receberEventos(payloadSimulado({ de: "5513988887777", texto: "Pode mandar o contrato" }));
    await rodarFila();

    const d = { ...(await dadosIniciais(lead.id)), contratanteDocumento: "123.456.789-09" };
    const r = await salvarRascunho(lead.id, d, "u1");
    await expect(enviarPorWhatsApp(r.id, "u1")).rejects.toThrow(ErroContrato); // sem finalizar não envia
    const f = await finalizar(r.id, "u1");
    expect(f.status).toBe("pronto");
    expect(f.conteudoHash).toHaveLength(64);

    await enviarPorWhatsApp(r.id, "u1", "http://localhost:3000");
    const link = linkPublico(f.tokenCifrado, "http://localhost:3000")!;
    const msg = await db.mensagem.findFirstOrThrow({ where: { direcao: "saida" }, orderBy: { criadoEm: "desc" } });
    expect(msg.conteudo).toContain(link);

    const token = link.split("/contrato/")[1];
    expect((await contratoPorToken(token))?.id).toBe(r.id);
    expect(await contratoPorToken("token-errado-qualquer-coisa")).toBeNull();

    await aceitar(token, { nome: "João da Silva", documento: "123.456.789-09", ip: "1.2.3.4", navegador: "teste" });
    const c = await db.contrato.findUniqueOrThrow({ where: { id: r.id } });
    expect(c).toMatchObject({ status: "aceito", aceiteNome: "João da Silva", aceiteIp: "1.2.3.4" });
    const l = await db.lead.findUniqueOrThrow({ where: { id: lead.id }, include: { etapa: true } });
    expect(l.etapa?.chave).toBe("fechado");
    expect(await db.notificacao.count({ where: { tipo: "contrato_aceito" } })).toBe(1);
  });

  it("texto finalizado não muda mesmo se o modelo for alterado depois", async () => {
    const lead = await criarLead();
    const r = await salvarRascunho(lead.id, { ...(await dadosIniciais(lead.id)), contratanteDocumento: "12345678909" }, "u1");
    const f = await finalizar(r.id, "u1");
    await salvarConfig("contrato", { ...(await obterConfig("contrato")), modelo: "OUTRO TEXTO {{numero}}" });
    expect((await db.contrato.findUniqueOrThrow({ where: { id: r.id } })).conteudo).toBe(f.conteudo);
  });
});

describe("aceite na conversa vira pendência de contrato", () => {
  it("transferência por aceite aparece em 'Gerar contrato' até o contrato ser finalizado; outras transferências não", async () => {
    const { transferirParaHumano, obterConversa } = await import("../src/core/whatsapp/conversas");
    const { contarPendencias } = await import("../src/core/pendencias");
    const aceitou = await criarLead();
    const pediuHumano = await db.lead.create({ data: { nome: "Outro", nomeNormalizado: "outro", telefoneE164: "+5513988886666", ehCelular: true } });
    const c1 = await obterConversa("+5513988887777", aceitou.id);
    const c2 = await obterConversa("+5513988886666", pediuHumano.id);
    await transferirParaHumano(c1.id, "Cliente aceitou a proposta.", { agente: true, aceite: true });
    await transferirParaHumano(c2.id, "Cliente pediu atendimento humano.", { agente: true });

    expect(await contarPendencias()).toMatchObject({ contratos: 1, intervencao: 1 });
    expect((await db.notificacao.findFirstOrThrow({ where: { leadId: aceitou.id } })).titulo).toMatch(/Gere o contrato/);

    const r = await salvarRascunho(aceitou.id, { ...(await dadosIniciais(aceitou.id)), contratanteDocumento: "12345678909" }, "u1");
    expect((await contarPendencias()).contratos).toBe(1); // rascunho ainda não conta
    await finalizar(r.id, "u1");
    expect(await contarPendencias()).toMatchObject({ contratos: 0, intervencao: 1 });
  });
});
