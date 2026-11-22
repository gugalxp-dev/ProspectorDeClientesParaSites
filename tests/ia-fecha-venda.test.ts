import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { salvarConfig } from "../src/core/config";
import { aceitar, contratoPorToken, linkPublico } from "../src/core/contratos";
import { garantirEtapas, idEtapa } from "../src/core/crm/etapas";
import { db } from "../src/core/db";
import { forcarProvedor } from "../src/core/ia/servico";
import type { ProvedorIA } from "../src/core/ia/tipos";
import { payloadSimulado, receberEventos } from "../src/core/whatsapp/webhook";
import { limparBanco, rodarFila } from "./ajuda";

const WA = "5513988887777";
let respostas: object[] = [];
const iaFalsa: ProvedorIA = {
  nome: "teste",
  suportaEmbeddings: false,
  async gerar() {
    return { texto: JSON.stringify(respostas.shift() ?? { resposta: "Ok!", intencao: "outro", etapa: "negociacao" }), modelo: "teste", tokensEntrada: 0, tokensSaida: 0 };
  },
  async embeddings() {
    throw new Error("sem embeddings");
  },
};

beforeEach(async () => {
  await limparBanco();
  await garantirEtapas();
  forcarProvedor(iaFalsa);
  respostas = [];
  await salvarConfig("contrato", { contratadaNome: "TechNino", contratadaDocumento: "68.287.354/0001-00", cidade: "Guarujá" });
  await db.servico.create({
    data: { nome: "Desenvolvimento de Sites", descricao: "Site completo", precoCentavos: 75000, prazoDias: 3, descontoMaxPct: 0, descontoMaxCentavos: 10000, condicoes: "Pix\nCartão" },
  });
  await db.lead.create({ data: { nome: "Pizzaria do Zé", nomeNormalizado: "pizzaria do ze", telefoneE164: `+${WA}`, ehCelular: true, contatoStatus: "autorizado", etapaId: await idEtapa("em_negociacao") } });
});
afterEach(() => forcarProvedor(null));

async function cliente(texto: string) {
  await receberEventos(payloadSimulado({ de: WA, texto }));
  await rodarFila(100, { ignorarAtraso: true });
}

describe("IA fecha a venda", () => {
  it("negocia dentro do limite, coleta os dados, envia o contrato; depois do aceite pausa e pede a cobrança", async () => {
    respostas = [
      { resposta: "Fechado! Fica R$ 700,00. Qual o nome ou razão social para o contrato?", intencao: "aceite", etapa: "formalizacao", fechamento: { servico: "Desenvolvimento de Sites", valor_final: 700 } },
      {
        resposta: "Perfeito! Resumo: Desenvolvimento de Sites por R$ 700,00 no Pix. Vou te enviar o contrato.",
        intencao: "aceite",
        etapa: "formalizacao",
        fechamento: { nome_contratante: "Pizzaria do Zé LTDA", documento: "12.345.678/0001-90", endereco: "Rua A, 10 - Guarujá", forma_pagamento: "Pix" },
        enviar_contrato: true,
      },
    ];
    await cliente("Fechado, faz por 700?");
    const conversa = await db.conversa.findFirstOrThrow();
    expect(conversa.status).toBe("ativa"); // não transferiu no aceite
    let rascunho = await db.contrato.findFirstOrThrow({ where: { status: "rascunho" } });
    expect(JSON.parse(rascunho.dados).valorCentavos).toBe(70000);

    await cliente("Pizzaria do Zé LTDA, CNPJ 12.345.678/0001-90, Rua A 10, pago no Pix");
    const c = await db.contrato.findFirstOrThrow();
    expect(c.status).toBe("enviado");
    const link = linkPublico(c.tokenCifrado, "http://localhost:3000")!;
    expect(await db.mensagem.count({ where: { conteudo: { contains: link } } })).toBe(1);
    expect(JSON.parse(c.dados)).toMatchObject({ contratanteNome: "Pizzaria do Zé LTDA", formaPagamento: "Pix", valorCentavos: 70000 });

    const token = link.split("/contrato/")[1];
    expect((await contratoPorToken(token))?.id).toBe(c.id);
    await aceitar(token, { nome: "José", documento: "123.456.789-09", ip: "1.1.1.1", navegador: "t" });
    const n = await db.notificacao.findFirstOrThrow({ where: { tipo: "cobranca" } });
    expect(n.mensagem).toMatch(/R\$\s700,00/);
    expect(n.mensagem).toMatch(/Pagamento: Pix/);
    expect((await db.conversa.findFirstOrThrow()).agenteAtivo).toBe(false);
    rascunho = await db.contrato.findFirstOrThrow();
    expect(rascunho.status).toBe("aceito");
  });

  it("não aceita valor abaixo do mínimo (preço - desconto máximo) e não envia contrato incompleto", async () => {
    respostas = [{ resposta: "Consigo fazer por R$ 600,00. Qual o nome?", intencao: "aceite", etapa: "formalizacao", fechamento: { servico: "Desenvolvimento de Sites", valor_final: 600 }, enviar_contrato: true }];
    await cliente("faz por 600?");
    // A mensagem com R$ 600 é bloqueada pela verificação (fora do desconto) e o valor do rascunho não muda.
    const r = await db.contrato.findFirst({ where: { status: "rascunho" } });
    if (r) expect(JSON.parse(r.dados).valorCentavos).toBe(75000);
    expect(await db.contrato.count({ where: { status: { not: "rascunho" } } })).toBe(0);
  });
});
