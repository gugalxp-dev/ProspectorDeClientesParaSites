import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { salvarConfig } from "../src/core/config";
import { garantirEtapas, idEtapa } from "../src/core/crm/etapas";
import { excluirDadosPessoais, moverLead, ConflitoEdicao } from "../src/core/crm/leads";
import { db } from "../src/core/db";
import { hmacHex } from "../src/lib/crypto";
import { forcarClienteWhatsApp, type ClienteWhatsApp } from "../src/core/whatsapp/cliente";
import {
  EnvioBloqueado,
  enviarMensagem,
  iniciarContato,
  pediuOptOut,
  reativarAgente,
  registrarConsentimento,
  registrarOptOut,
  variantesTelefone,
} from "../src/core/whatsapp/conversas";
import { assinaturaValida, payloadSimulado, receberEventos } from "../src/core/whatsapp/webhook";
import { limparBanco, rodarFila } from "./ajuda";

const TEL = "+5513988887777";
const WA_ID = "5513988887777";

async function criarLead(extra: Record<string, unknown> = {}) {
  return db.lead.create({
    data: {
      nome: "Pet Feliz",
      nomeNormalizado: "pet feliz",
      segmento: "Pet shops",
      cidade: "Praia Grande",
      telefone: "(13) 98888-7777",
      telefoneE164: TEL,
      ehCelular: true,
      etapaId: await idEtapa("qualificado"),
      ...extra,
    },
  });
}

async function clienteEscreve(texto: string, de = WA_ID) {
  await receberEventos(payloadSimulado({ de, texto }));
  await rodarFila();
}

async function mensagens(leadId: string) {
  const c = await db.conversa.findUniqueOrThrow({ where: { leadId }, include: { mensagens: { orderBy: { criadoEm: "asc" } } } });
  return c.mensagens;
}

beforeEach(async () => {
  await limparBanco();
  await garantirEtapas();
  await db.servico.create({ data: { nome: "Site institucional", descricao: "Até 5 páginas", precoCentavos: 150000, prazoDias: 20, descontoMaxPct: 10 } });
  await db.conhecimento.create({ data: { categoria: "objecoes", titulo: "Já tenho Instagram", conteudo: "O Instagram é ótimo para engajamento, mas um site próprio aparece no Google e centraliza serviços, horários e contato." } });
});
afterEach(() => forcarClienteWhatsApp(null));

describe("webhook", () => {
  it("valida a assinatura X-Hub-Signature-256 em tempo constante", () => {
    const corpo = '{"a":1}';
    const sig = `sha256=${hmacHex("segredo", corpo)}`;
    expect(assinaturaValida(corpo, sig, "segredo")).toBe(true);
    expect(assinaturaValida(corpo + " ", sig, "segredo")).toBe(false);
    expect(assinaturaValida(corpo, null, "segredo")).toBe(false);
    expect(assinaturaValida(corpo, "sha256=abc", "segredo")).toBe(false);
  });

  it("ignora eventos repetidos (a Meta reenvia)", async () => {
    const p = payloadSimulado({ de: WA_ID, texto: "Oi" });
    expect(await receberEventos(p)).toEqual({ novos: 1, repetidos: 0 });
    expect(await receberEventos(p)).toEqual({ novos: 0, repetidos: 1 });
  });

  it("associa a mensagem ao lead mesmo sem o nono dígito", async () => {
    expect(variantesTelefone(TEL)).toContain("+551388887777");
    const lead = await criarLead();
    await clienteEscreve("Oi, quero saber mais", "551388887777");
    const ms = await mensagens(lead.id);
    expect(ms[0]).toMatchObject({ direcao: "entrada", autor: "cliente", conteudo: "Oi, quero saber mais" });
  });

  it("número desconhecido gera notificação, sem resposta automática", async () => {
    await clienteEscreve("Olá", "5511999990000");
    expect(await db.notificacao.count({ where: { titulo: { contains: "desconhecido" } } })).toBe(1);
    expect(await db.mensagem.count({ where: { direcao: "saida" } })).toBe(0);
  });
});

describe("consentimento e opt-out", () => {
  it("sem opt-in, iniciar contato registra legítimo interesse sozinho e envia", async () => {
    const lead = await criarLead();
    const { mensagem } = await iniciarContato(lead.id, "u1");
    expect(mensagem.status).toBe("enviada");
    const c = await db.consentimento.findFirstOrThrow({ where: { leadId: lead.id } });
    expect(c.baseLegal).toBe("legitimo_interesse");
  });

  it("com opt-out, iniciar contato continua bloqueado", async () => {
    const lead = await criarLead();
    await registrarOptOut({ leadId: lead.id }, "pediu para parar", "u1");
    await expect(iniciarContato(lead.id, "u1")).rejects.toThrow(EnvioBloqueado);
    expect(await db.mensagem.count()).toBe(0);
  });

  it("com opt-in registrado, o primeiro contato sai por template e é auditado", async () => {
    const lead = await criarLead();
    await registrarConsentimento(lead.id, { origem: "Cliente pediu orçamento no formulário", baseLegal: "consentimento", evidencia: "form #12" }, "u1");
    const { mensagem } = await iniciarContato(lead.id, "u1");
    expect(mensagem).toMatchObject({ tipo: "template", status: "enviada", autor: "humano" });
    expect(await db.auditoria.count({ where: { acao: "consentimento_registrado" } })).toBe(1);
    await rodarFila(200, { ignorarAtraso: true }); // simulador confirma entrega
    expect((await db.mensagem.findUniqueOrThrow({ where: { id: mensagem.id } })).status).toBe("entregue");
  });

  it("detecta pedidos de opt-out sem falso positivo", () => {
    const palavras = ["parar", "sair", "não quero receber"];
    expect(pediuOptOut("PARAR", palavras)).toBe(true);
    expect(pediuOptOut("Não quero receber mensagens", palavras)).toBe(true);
    expect(pediuOptOut("não vou parar de vender", palavras)).toBe(false);
  });

  it("opt-out bloqueia tudo daí em diante e sobrevive à exclusão do lead", async () => {
    const lead = await criarLead();
    await clienteEscreve("Oi");
    await clienteEscreve("sair");
    const l = await db.lead.findUniqueOrThrow({ where: { id: lead.id } });
    expect(l).toMatchObject({ naoContatar: true, contatoStatus: "opt_out" });
    const conversa = await db.conversa.findUniqueOrThrow({ where: { leadId: lead.id } });
    await expect(enviarMensagem({ conversaId: conversa.id, autor: "humano", texto: "Oi de novo" })).rejects.toThrow(EnvioBloqueado);
    await expect(registrarConsentimento(lead.id, { origem: "x", baseLegal: "consentimento" }, "u1")).rejects.toThrow(/opt-out/);

    await excluirDadosPessoais(lead.id, "u1", "pedido do titular");
    expect(await db.lead.count()).toBe(0);
    expect(await db.mensagem.count()).toBe(0);
    expect(await db.supressao.count()).toBeGreaterThan(0);
    // Redescoberto depois: já entra bloqueado.
    const { importarLugares } = await import("../src/core/prospeccao/importar");
    const busca = await db.busca.create({ data: { nicho: "x", cidade: "y", fontes: "[]" } });
    await importarLugares(busca.id, "x", "y", [{ fonte: "osm", idExterno: "node/1", nome: "Pet Feliz", telefone: "13 98888-7777" }]);
    expect(await db.lead.findFirstOrThrow()).toMatchObject({ naoContatar: true, contatoStatus: "opt_out" });
  });
});

describe("agente comercial", () => {
  it("responde dentro da janela, com histórico gravado nos dois sentidos", async () => {
    const lead = await criarLead();
    await clienteEscreve("Oi, recebi a mensagem. Como funciona?");
    const ms = await mensagens(lead.id);
    expect(ms.map((m) => [m.direcao, m.autor])).toEqual([
      ["entrada", "cliente"],
      ["saida", "agente"],
    ]);
    const l = await db.lead.findUniqueOrThrow({ where: { id: lead.id }, include: { etapa: true } });
    expect(l.contatoStatus).toBe("autorizado"); // o próprio cliente escreveu
    expect(l.etapa?.chave).toBe("em_negociacao");
  });

  it("informa só preço cadastrado", async () => {
    const lead = await criarLead();
    await clienteEscreve("Qual o valor?");
    const resposta = (await mensagens(lead.id)).at(-1)!;
    expect(resposta.conteudo).toContain("1.500,00");
  });

  it("usa a base de conhecimento ao tratar objeção", async () => {
    const lead = await criarLead();
    await clienteEscreve("Ah, mas eu já tenho Instagram");
    const resposta = (await mensagens(lead.id)).at(-1)!;
    expect(resposta.conteudo).toContain("Instagram é ótimo");
    const c = await db.conversa.findUniqueOrThrow({ where: { leadId: lead.id } });
    expect(JSON.parse(c.objecoes!)).toHaveLength(1);
  });

  it("aceite transfere para humano: para a automação, registra motivo, notifica e avisa o cliente", async () => {
    await salvarConfig("agente", { iaFechaVenda: false }); // modo antigo: quem fecha é a pessoa
    const lead = await criarLead();
    await clienteEscreve("Oi");
    await clienteEscreve("Fechado, quero contratar!");
    const l = await db.lead.findUniqueOrThrow({ where: { id: lead.id }, include: { etapa: true } });
    expect(l.etapa?.chave).toBe("intervencao_humana");
    expect(l.automacaoPausada).toBe(true);
    expect(l.motivoTransferencia).toMatch(/aceitou/);
    expect(await db.notificacao.count({ where: { tipo: "aceite", leadId: lead.id } })).toBe(1); // aceite: "Gere o contrato"
    const ms = await mensagens(lead.id);
    expect(ms.at(-1)!.conteudo).toMatch(/pessoa da nossa equipe/);
    const c = await db.conversa.findUniqueOrThrow({ where: { leadId: lead.id } });
    expect(c).toMatchObject({ status: "transferida", agenteAtivo: false });

    // Depois da transferência o agente não envia nada sozinho...
    const antes = await db.mensagem.count({ where: { direcao: "saida" } });
    await clienteEscreve("Pode me mandar o contrato?");
    expect(await db.mensagem.count({ where: { direcao: "saida" } })).toBe(antes);
    expect(await db.notificacao.count({ where: { leadId: lead.id } })).toBe(2);
    await expect(enviarMensagem({ conversaId: c.id, autor: "agente", texto: "oi" })).rejects.toThrow(/pausada/);
    // ...mas a pessoa pode responder manualmente.
    await enviarMensagem({ conversaId: c.id, autor: "humano", texto: "Olá! Sou o responsável, vou te enviar o contrato." });

    // Só volta com autorização explícita, por lead.
    await reativarAgente(c.id, "u1");
    expect(await db.auditoria.count({ where: { acao: "agente_reativado" } })).toBe(1);
    await clienteEscreve("Obrigado! Mais uma dúvida");
    expect((await mensagens(lead.id)).at(-1)!.autor).toBe("agente");
  });

  it("bloqueia resposta da IA com preço inventado e transfere", async () => {
    const { forcarProvedor } = await import("../src/core/ia/servico");
    const { ProvedorMock } = await import("../src/core/ia/mock");
    forcarProvedor(new ProvedorMock(() => JSON.stringify({ resposta: "Faço por R$ 900,00 hoje!", intencao: "interesse", objecoes_novas: [], etapa: "negociacao", transferir: false })));
    try {
      const lead = await criarLead();
      await clienteEscreve("Faz um preço bom?");
      const ms = await mensagens(lead.id);
      expect(ms.find((m) => m.status === "bloqueada")?.erro).toMatch(/900,00/);
      expect(ms.some((m) => m.conteudo.includes("900") && m.status !== "bloqueada")).toBe(false);
      expect((await db.lead.findUniqueOrThrow({ where: { id: lead.id } })).automacaoPausada).toBe(true);
    } finally {
      forcarProvedor(null);
    }
  });

  it("não insiste: sem resposta do cliente, o agente não manda mais mensagens", async () => {
    await salvarConfig("agente", { maxSaidasSemResposta: 1 });
    const lead = await criarLead();
    await clienteEscreve("Oi");
    const c = await db.conversa.findUniqueOrThrow({ where: { leadId: lead.id } });
    await expect(enviarMensagem({ conversaId: c.id, autor: "agente", texto: "E aí, pensou?" })).rejects.toThrow(/não insiste/);
  });

  it("fora da janela de 24 h só template", async () => {
    const lead = await criarLead();
    await clienteEscreve("Oi");
    const c = await db.conversa.findUniqueOrThrow({ where: { leadId: lead.id } });
    await db.conversa.update({ where: { id: c.id }, data: { ultimaEntradaEm: new Date(Date.now() - 25 * 3600_000) } });
    await expect(enviarMensagem({ conversaId: c.id, autor: "humano", texto: "Oi" })).rejects.toThrow(/24 h/);
  });

  it("falha da API fica registrada e o status não regride", async () => {
    const lead = await criarLead();
    await clienteEscreve("Oi");
    const c = await db.conversa.findUniqueOrThrow({ where: { leadId: lead.id } });
    const falho: ClienteWhatsApp = {
      modo: "cloud",
      enviarTexto: async () => {
        const { ErroWhatsApp } = await import("../src/core/whatsapp/cliente");
        throw new ErroWhatsApp("WhatsApp HTTP 400 (código 131026): undeliverable", 131026, true);
      },
      enviarTemplate: async () => ({ id: "x" }),
      estado: async () => ({ ok: true, detalhe: "" }),
    };
    forcarClienteWhatsApp(falho);
    await expect(enviarMensagem({ conversaId: c.id, autor: "humano", texto: "Teste" })).rejects.toThrow(EnvioBloqueado);
    expect((await mensagens(lead.id)).at(-1)).toMatchObject({ status: "falhou" });
    forcarClienteWhatsApp(null);

    const ok = await enviarMensagem({ conversaId: c.id, autor: "humano", texto: "Teste 2" });
    await receberEventos(payloadSimulado({ de: "", status: { id: ok.waMessageId!, status: "read" } }));
    await receberEventos(payloadSimulado({ de: "", status: { id: ok.waMessageId!, status: "delivered" } }));
    await rodarFila();
    expect((await db.mensagem.findUniqueOrThrow({ where: { id: ok.id } })).status).toBe("lida");
  });
});

describe("CRM", () => {
  it("move cartão com controle de concorrência e registra histórico", async () => {
    const lead = await criarLead();
    const negociacao = await idEtapa("em_negociacao");
    const movido = await moverLead(lead.id, negociacao, lead.revisao, "u1");
    expect(movido.etapaId).toBe(negociacao);
    await expect(moverLead(lead.id, await idEtapa("fechado"), lead.revisao, "u1")).rejects.toThrow(ConflitoEdicao);
    expect(await db.interacaoLead.count({ where: { leadId: lead.id, tipo: "etapa" } })).toBe(1);
  });
});
