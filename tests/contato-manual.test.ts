import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { salvarConfig } from "../src/core/config";
import { garantirEtapas, idEtapa } from "../src/core/crm/etapas";
import { db } from "../src/core/db";
import { forcarProvedor } from "../src/core/ia/servico";
import type { ProvedorIA } from "../src/core/ia/tipos";
import { prepararContatoManual } from "../src/core/whatsapp/conversas";
import { payloadSimulado, receberEventos } from "../src/core/whatsapp/webhook";
import { limparBanco, rodarFila } from "./ajuda";

const WA = "5513988887777";
const iaFalsa: ProvedorIA = {
  nome: "teste",
  suportaEmbeddings: false,
  async gerar(p) {
    // O agente precisa enxergar a mensagem manual no histórico.
    const viu = p.mensagens.some((m) => m.papel === "assistant" && m.conteudo.includes("Pizzaria do Zé"));
    return { texto: JSON.stringify({ resposta: viu ? "Que bom que respondeu! O site sai por R$ 750,00." : "sem contexto", intencao: "interesse", etapa: "apresentacao" }), modelo: "t", tokensEntrada: 0, tokensSaida: 0 };
  },
  async embeddings() {
    throw new Error("sem embeddings");
  },
};

beforeEach(async () => {
  await limparBanco();
  await garantirEtapas();
  forcarProvedor(iaFalsa);
  await salvarConfig("agente", { nomeAgente: "Gus", nomeEmpresa: "TechNino", mensagemPrimeiroContato: "Olá! Aqui é {agente}, da {empresa}. Trabalhamos com sites para empresas como a {nome}. Posso te mostrar uma ideia?" });
  await db.servico.create({ data: { nome: "Desenvolvimento de Sites", descricao: "Site", precoCentavos: 75000, prazoDias: 3 } });
  await db.lead.create({ data: { nome: "Pizzaria do Zé", nomeNormalizado: "pizzaria do ze", telefoneE164: `+${WA}`, ehCelular: true, etapaId: await idEtapa("qualificado") } });
});
afterEach(() => forcarProvedor(null));

describe("primeiro contato manual (WhatsApp Web)", () => {
  it("registra o contato e devolve o link com o texto; quando o cliente responde, o agente assume com o contexto", async () => {
    const lead = await db.lead.findFirstOrThrow();
    const r = await prepararContatoManual(lead.id, "u1");
    expect(r.link).toBe(`https://wa.me/${WA}?text=${encodeURIComponent(r.texto)}`);
    expect(r.texto).toBe("Olá! Aqui é Gus, da TechNino. Trabalhamos com sites para empresas como a Pizzaria do Zé. Posso te mostrar uma ideia?");
    const l = await db.lead.findUniqueOrThrow({ where: { id: lead.id }, include: { etapa: true } });
    expect(l).toMatchObject({ contatoStatus: "autorizado" });
    expect(l.etapa?.chave).toBe("aguardando_resposta");
    expect(await db.mensagem.count({ where: { status: "manual" } })).toBe(1);

    await receberEventos(payloadSimulado({ de: WA, texto: "Oi, quanto custa?" }));
    await rodarFila(100, { ignorarAtraso: true });
    expect(await db.mensagem.count({ where: { autor: "agente", conteudo: { contains: "Que bom que respondeu" } } })).toBe(1);
  });
});
