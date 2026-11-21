import { beforeEach, describe, expect, it } from "vitest";
import { valorPermitido, verificarResposta, centavosDe } from "../src/core/agente/regras";
import { buscarConhecimento } from "../src/core/agente/conhecimento";
import { salvarConfig } from "../src/core/config";
import { db } from "../src/core/db";
import { chamarIA } from "../src/core/ia/servico";
import { LimiteConsumoExcedido } from "../src/core/ia/tipos";
import { credencial, estadoCredenciais, salvarCredencial } from "../src/core/segredos";
import { cifrar, conferirSenha, decifrar, hashSecret, hashSenha, iguaisSeguro } from "../src/lib/crypto";
import { mesmaOrigem } from "../src/lib/http";
import { dentroDoLimite } from "../src/lib/limite";
import { limparObjeto, mascararSegredos } from "../src/lib/log";
import { limparBanco } from "./ajuda";

beforeEach(limparBanco);

describe("criptografia", () => {
  it("senha com scrypt e sal: confere a certa, recusa a errada, hashes diferentes", async () => {
    const h1 = await hashSenha("senha-forte-123");
    const h2 = await hashSenha("senha-forte-123");
    expect(h1).not.toBe(h2);
    expect(h1).toMatch(/^scrypt\$/);
    expect(await conferirSenha("senha-forte-123", h1)).toBe(true);
    expect(await conferirSenha("senha-errada", h1)).toBe(false);
  });

  it("AES-256-GCM: ida e volta, e detecta adulteração", () => {
    const c = cifrar("sk-segredo");
    expect(c).not.toContain("sk-segredo");
    expect(decifrar(c)).toBe("sk-segredo");
    const adulterado = Buffer.from(c, "base64");
    adulterado[adulterado.length - 1] ^= 1;
    expect(() => decifrar(adulterado.toString("base64"))).toThrow();
  });

  it("HMAC de tokens e comparação em tempo constante", () => {
    expect(hashSecret("abc")).toHaveLength(64);
    expect(hashSecret("abc")).not.toBe("abc");
    expect(iguaisSeguro("abc", "abc")).toBe(true);
    expect(iguaisSeguro("abc", "abd")).toBe(false);
  });
});

describe("credenciais", () => {
  it("guarda cifrada e mostra só os 4 últimos caracteres", async () => {
    await salvarCredencial("WHATSAPP_TOKEN", "EAAtokenmuitosecreto1234", "u1");
    const linha = await db.segredo.findUniqueOrThrow({ where: { chave: "WHATSAPP_TOKEN" } });
    expect(linha.cifrado).not.toContain("EAAtoken");
    expect(await credencial("WHATSAPP_TOKEN")).toBe("EAAtokenmuitosecreto1234");
    const estado = (await estadoCredenciais()).find((e) => e.nome === "WHATSAPP_TOKEN")!;
    expect(estado).toMatchObject({ origem: "painel", final: "1234" });
    expect(JSON.stringify(await estadoCredenciais())).not.toContain("muitosecreto");
  });
});

describe("logs sem segredos", () => {
  it("mascara tokens, chaves e campos sensíveis", () => {
    expect(mascararSegredos("Authorization: Bearer abc.def-123")).toBe("Authorization: Bearer ••••");
    expect(mascararSegredos("chave sk-proj-AAAAAAAAAAAA")).toBe("chave sk-••••");
    expect(mascararSegredos("https://x?hub.verify_token=123&a=1")).toBe("https://x?hub.verify_token=••••&a=1");
    expect(limparObjeto({ senha: "x", apiKey: "y", nome: "ok" })).toEqual({ senha: "••••", apiKey: "••••", nome: "ok" });
  });
});

describe("API", () => {
  it("CSRF: recusa origem diferente do host", () => {
    const req = (origin?: string) => new Request("http://localhost:3000/api/x", { method: "POST", headers: { host: "localhost:3000", ...(origin ? { origin } : {}) } });
    expect(mesmaOrigem(req("http://localhost:3000"))).toBe(true);
    expect(mesmaOrigem(req("https://malicioso.com"))).toBe(false);
    expect(mesmaOrigem(req())).toBe(true);
  });

  it("rate limit por janela deslizante", async () => {
    for (let i = 0; i < 5; i++) expect(await dentroDoLimite("login:email:a@b.com", 5, 60_000)).toBe(true);
    expect(await dentroDoLimite("login:email:a@b.com", 5, 60_000)).toBe(false);
    expect(await dentroDoLimite("login:email:outro@b.com", 5, 60_000)).toBe(true);
  });
});

describe("regras comerciais do agente", () => {
  const servicos = [{ nome: "Site", precoCentavos: 150000, descontoMaxPct: 10, condicoes: "Entrada de R$ 500,00 e o restante na entrega" }];

  it("aceita preço cadastrado, desconto dentro do limite, parcelas e valores das condições", () => {
    expect(centavosDe("1.500,00")).toBe(150000);
    expect(valorPermitido(150000, servicos)).toBe(true);
    expect(valorPermitido(135000, servicos)).toBe(true); // 10%
    expect(valorPermitido(50000, servicos)).toBe(true); // condições
    expect(valorPermitido(50000 * 3, servicos)).toBe(true);
    expect(valorPermitido(30000, servicos)).toBe(true); // 5x
    expect(valorPermitido(120000, servicos)).toBe(false); // 20% de desconto
  });

  it("bloqueia promessa de resultado e preço inventado", () => {
    expect(verificarResposta("Com o site você vai aumentar suas vendas!", servicos).ok).toBe(false);
    expect(verificarResposta("Garantimos mais clientes em 30 dias.", servicos).ok).toBe(false);
    expect(verificarResposta("Sai por R$ 999,00.", servicos).ok).toBe(false);
    expect(verificarResposta("O site sai por R$ 1.500,00, em até 20 dias.", servicos).ok).toBe(true);
  });
});

describe("IA: limites de consumo e custos", () => {
  it("registra uso e marca simulado com custo zero", async () => {
    const r = await chamarIA({ operacao: "teste", sistema: "s", mensagens: [{ papel: "user", conteudo: "oi" }], respostaMock: () => "ok" });
    expect(r).toMatchObject({ texto: "ok", simulado: true });
    const c = await db.registroCusto.findFirstOrThrow();
    expect(c).toMatchObject({ provedor: "mock", custoUsd: 0, operacao: "teste" });
    expect(c.tokensEntrada).toBeGreaterThan(0);
  });

  it("bloqueia chamadas pagas acima do limite", async () => {
    const { forcarProvedor } = await import("../src/core/ia/servico");
    const pago = { nome: "openai", gerar: async () => ({ texto: "x", modelo: "gpt-4o-mini", tokensEntrada: 1, tokensSaida: 1 }), embeddings: async () => ({ vetores: [], modelo: "", tokens: 0 }) };
    forcarProvedor(pago);
    try {
      await salvarConfig("ia", { limiteDiarioUsd: 0.01 });
      await db.registroCusto.create({ data: { categoria: "ia", provedor: "openai", operacao: "agente", custoUsd: 0.02 } });
      await expect(chamarIA({ operacao: "teste", sistema: "s", mensagens: [] })).rejects.toThrow(LimiteConsumoExcedido);
    } finally {
      forcarProvedor(null);
    }
  });
});

describe("RAG", () => {
  it("encontra o trecho relevante da base de conhecimento", async () => {
    await db.conhecimento.createMany({
      data: [
        { categoria: "beneficios", titulo: "Credibilidade", conteudo: "Um site profissional transmite credibilidade e confiança ao cliente." },
        { categoria: "objecoes", titulo: "Preço alto", conteudo: "Quando o cliente acha caro, explique o investimento e o prazo de uso do site." },
        { categoria: "segmentos", titulo: "Pet shops", conteudo: "Para pet shops, o site pode mostrar banho e tosa, agendamento e localização." },
      ],
    });
    const r = await buscarConhecimento("achei caro o preço", 2);
    expect(r[0].titulo).toBe("Preço alto");
    const p = await buscarConhecimento("tenho um pet shop", 1);
    expect(p[0].titulo).toBe("Pet shops");
  });
});
