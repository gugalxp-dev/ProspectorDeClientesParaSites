import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { atualizarProgresso, criarBusca, refazerBusca, resumoBusca } from "../src/core/busca";
import { registrarClienteLocal, type ClienteWhatsApp } from "../src/core/whatsapp/cliente";
import { salvarConfig } from "../src/core/config";
import { garantirEtapas } from "../src/core/crm/etapas";
import { db } from "../src/core/db";
import { eventosDesde } from "../src/core/eventos";
import { enfileirar, recuperarTravados, reservar } from "../src/core/fila";
import { registrarFonte } from "../src/core/fontes";
import { FonteIndisponivel, type FonteDescoberta } from "../src/core/fontes/tipos";
import { definirGeocoder } from "../src/core/geocode";
import { definirFetchCrawler } from "../src/core/prospeccao/crawler";
import { definirRedeDescobertaSite } from "../src/core/prospeccao/descobrirSite";
import type { LugarBruto } from "../src/core/tipos";
import { fetchFalso, limparBanco, rodarFila } from "./ajuda";

const SITES = {
  "https://petfeliz.com.br": '<html><head><title>Pet Feliz</title></head><body><a href="/contato">Contato</a></body></html>',
  "https://petfeliz.com.br/contato": '<a href="https://wa.me/5513988880001">WhatsApp</a> contato@petfeliz.com.br',
};

function fonteFalsa(id: string, lugares: (nicho: string) => LugarBruto[], falhasAntes = 0): FonteDescoberta & { chamadas: number } {
  const f = {
    id,
    nome: `Fonte ${id}`,
    descricao: "teste",
    gratuita: true,
    chamadas: 0,
    async disponivel() {
      return { ok: true };
    },
    async descobrir(p: { nicho: string }) {
      f.chamadas++;
      if (f.chamadas <= falhasAntes) throw new FonteIndisponivel("servidor ocupado");
      return lugares(p.nicho);
    },
  };
  return f;
}

const lugar = (id: string, nome: string, extra: Partial<LugarBruto> = {}): LugarBruto => ({ fonte: "fa", idExterno: id, nome, cidade: "Praia Grande", ...extra });

beforeAll(() => {
  definirGeocoder(async () => ({ lat: -24, lon: -46.4, bbox: [-24.1, -23.9, -46.5, -46.3], nome: "Praia Grande" }));
  definirFetchCrawler(fetchFalso(SITES));
  definirRedeDescobertaSite(fetchFalso(SITES), async () => false);
});
afterAll(() => {
  definirGeocoder(null);
  definirFetchCrawler(null);
  definirRedeDescobertaSite(null, null);
});

beforeEach(async () => {
  await limparBanco();
  await garantirEtapas();
  await salvarConfig("prospeccao", { exigirCelular: false, descartarComSiteBom: false, fontes: { fa: { ativa: true }, fb: { ativa: false } }, crawler: { profundidade: 1, maxPaginasPorSite: 3, concorrencia: 4, atrasoPorHostMs: 250, timeoutMs: 5000, respeitarRobots: true } });
});

describe("pesquisas", () => {
  it("cria a pesquisa e enfileira a descoberta (nada roda dentro da requisição)", async () => {
    registrarFonte(fonteFalsa("fa", () => []));
    const b = await criarBusca({ nicho: "Pet shops", cidade: "Praia Grande" }, null);
    expect(b.status).toBe("pendente");
    const jobs = await db.job.findMany({ where: { buscaId: b.id } });
    expect(jobs.map((j) => j.tipo)).toEqual(["busca_descobrir"]);
  });

  it("recusa quando nenhuma fonte está ativa", async () => {
    await salvarConfig("prospeccao", { fontes: { fa: { ativa: false } } });
    await expect(criarBusca({ nicho: "x", cidade: "y" }, null)).rejects.toThrow(/Nenhuma fonte/);
  });

  it("pipeline completo: descobre, rastreia, extrai, qualifica e conclui", async () => {
    registrarFonte(
      fonteFalsa("fa", () => [
        lugar("1", "Pet Feliz", { website: "https://petfeliz.com.br", telefone: "(13) 3333-0001" }),
        lugar("2", "Banho e Tosa Amigo", { telefone: "(13) 98888-0002" }),
        lugar("3", "Fechado", { ativo: false }),
      ]),
    );
    const b = await criarBusca({ nicho: "Pet shops", cidade: "Praia Grande" }, null);
    await rodarFila();

    const r = (await resumoBusca(b.id))!;
    expect(r.status).toBe("concluida");
    expect(r.encontradas).toBe(2);
    expect(r.analisadas).toBe(2);
    expect(r.progresso).toBe(100);

    const pet = await db.lead.findFirstOrThrow({ where: { nome: "Pet Feliz" }, include: { dados: true, etapa: true } });
    expect(pet.presenca).toBe("com_site");
    expect(pet.whatsappE164).toBe("+5513988880001");
    expect(pet.emails).toBe("contato@petfeliz.com.br");
    expect(pet.dados.find((d) => d.campo === "whatsapp")?.url).toBe("https://petfeliz.com.br/contato");
    expect(pet.qualificacao).toBeTruthy();
    const q = JSON.parse(pet.qualificacao!);
    expect(q.simulado).toBe(true);
    expect(q.problemas.every((p: { tipo: string }) => ["fato", "hipotese"].includes(p.tipo))).toBe(true);

    const banho = await db.lead.findFirstOrThrow({ where: { nome: "Banho e Tosa Amigo" }, include: { etapa: true } });
    expect(banho.presenca).toBe("sem_site_identificado");
    expect(banho.presencaConfianca).toBe("baixa");
    expect(banho.qualificacaoStatus).toBe("qualificado");
    expect(banho.etapa?.chave).toBe("qualificado");
    expect(await db.registroCusto.count({ where: { buscaId: b.id, operacao: "qualificacao" } })).toBe(2);
  });

  it("filtro: não registra sem celular, apaga quem tem site bom, sem gastar IA; mantém quem tem celular e precisa de site", async () => {
    await salvarConfig("prospeccao", { fontes: { fa: { ativa: true } }, crawler: { profundidade: 1, maxPaginasPorSite: 3, concorrencia: 4, atrasoPorHostMs: 250, timeoutMs: 5000, respeitarRobots: true } });
    registrarFonte(
      fonteFalsa("fa", () => [
        lugar("1", "Pet Feliz", { website: "https://petfeliz.com.br", telefone: "(13) 3333-0001" }),
        lugar("2", "Banho e Tosa Amigo", { telefone: "(13) 98888-0002" }),
        lugar("3", "Sem Numero Pet"),
      ]),
    );
    const b = await criarBusca({ nicho: "Pet shops", cidade: "Praia Grande" }, null);
    await rodarFila(200, { ignorarAtraso: true });
    // Pet Feliz: tem WhatsApp no site, mas o site está bom -> apagado depois da visita.
    // Sem Numero Pet: sem celular e sem site -> nem chega a ser registrado.
    const leads = await db.lead.findMany({ select: { nome: true, qualificacaoStatus: true } });
    expect(leads).toEqual([{ nome: "Banho e Tosa Amigo", qualificacaoStatus: "qualificado" }]);
    expect(await db.registroCusto.count({ where: { buscaId: b.id, operacao: "qualificacao" } })).toBe(1);
    expect((await resumoBusca(b.id))?.descartadas).toBe(2);
  });

  it("fixo com WhatsApp (verificado no Baileys) entra; fixo sem WhatsApp é ignorado", async () => {
    await salvarConfig("prospeccao", { fontes: { fa: { ativa: true } }, crawler: { profundidade: 1, maxPaginasPorSite: 3, concorrencia: 4, atrasoPorHostMs: 250, timeoutMs: 5000, respeitarRobots: true } });
    const comWhats = "+551333330010";
    registrarClienteLocal({ modo: "baileys", temWhatsApp: async (e164: string) => e164 === comWhats } as unknown as ClienteWhatsApp);
    try {
      registrarFonte(
        fonteFalsa("fa", () => [
          lugar("1", "Pastelaria Com Whats", { telefone: "(13) 3333-0010" }),
          lugar("2", "Pastelaria Sem Whats", { telefone: "(13) 3333-0020" }),
        ]),
      );
      await criarBusca({ nicho: "Pastel", cidade: "Guarujá" }, null);
      await rodarFila(200, { ignorarAtraso: true });
      const leads = await db.lead.findMany({ select: { nome: true, whatsappE164: true } });
      expect(leads).toEqual([{ nome: "Pastelaria Com Whats", whatsappE164: comWhats }]);
    } finally {
      registrarClienteLocal(null);
    }
  });

  it("refazer pesquisa: zera o andamento, busca de novo e reaproveita as empresas sem duplicar", async () => {
    let vez = 0;
    registrarFonte(fonteFalsa("fa", () => (++vez === 1 ? [lugar("1", "Banho e Tosa Amigo", { telefone: "(13) 98888-0002" })] : [lugar("1", "Banho e Tosa Amigo", { telefone: "(13) 98888-0002" }), lugar("2", "Pet Novo", { telefone: "(13) 98888-0003" })])));
    const b = await criarBusca({ nicho: "Pet shops", cidade: "Praia Grande" }, null);
    await rodarFila(200, { ignorarAtraso: true });
    expect((await resumoBusca(b.id))?.encontradas).toBe(1);
    await refazerBusca(b.id);
    expect((await db.busca.findUniqueOrThrow({ where: { id: b.id } })).status).toBe("pendente");
    await rodarFila(200, { ignorarAtraso: true });
    const r = await resumoBusca(b.id);
    expect(r).toMatchObject({ status: "concluida", encontradas: 2 });
    expect(await db.lead.count()).toBe(2);
  });

  it("pesquisas simultâneas mantêm resultados próprios e deduplicam empresas globalmente", async () => {
    registrarFonte(
      fonteFalsa("fa", (nicho) =>
        nicho === "Pet shops"
          ? [lugar("1", "Pet Feliz LTDA", { telefone: "(13) 98888-1111" }), lugar("2", "Só Pet")]
          : [lugar("9", "PET FELIZ", { telefone: "+55 13 98888-1111", fonte: "fa" }), lugar("10", "Vet Amigo")],
      ),
    );
    const [a, b] = await Promise.all([
      criarBusca({ nicho: "Pet shops", cidade: "Praia Grande" }, null),
      criarBusca({ nicho: "Veterinários", cidade: "Praia Grande" }, null),
    ]);
    await rodarFila();
    expect(await db.lead.count()).toBe(3); // Pet Feliz aparece nas duas, mas é uma empresa só
    const ra = (await resumoBusca(a.id))!;
    const rb = (await resumoBusca(b.id))!;
    expect([ra.encontradas, rb.encontradas]).toEqual([2, 2]);
    expect(ra.status).toBe("concluida");
    expect(rb.status).toBe("concluida");
    const pet = await db.lead.findFirstOrThrow({ where: { telefoneE164: "+5513988881111" }, include: { buscas: true, origens: true } });
    expect(pet.buscas).toHaveLength(2);
    expect(pet.origens).toHaveLength(2);
  });

  it("recupera de falha temporária da fonte com retentativa", async () => {
    const f = fonteFalsa("fa", () => [lugar("1", "Loja A")], 1);
    registrarFonte(f);
    const b = await criarBusca({ nicho: "Lojas", cidade: "Praia Grande" }, null);
    await rodarFila(50, { ignorarAtraso: true });
    expect(f.chamadas).toBe(2);
    expect((await resumoBusca(b.id))!.status).toBe("concluida");
    expect(await db.lead.count()).toBe(1);
  });

  it("marca a pesquisa como falha quando a fonte nunca responde", async () => {
    registrarFonte(fonteFalsa("fa", () => [], 99));
    const b = await criarBusca({ nicho: "Lojas", cidade: "Praia Grande" }, null);
    await rodarFila(50, { ignorarAtraso: true });
    const r = (await resumoBusca(b.id))!;
    expect(r.status).toBe("falhou");
    expect(r.erros).toBeGreaterThanOrEqual(0);
  });

  it("devolve à fila trabalho travado de worker que caiu", async () => {
    await enfileirar("lead_processar", { leadId: "x" }, { chave: "travado" });
    const [j] = await reservar(["lead_processar"], 1, -1000); // lease já vencido
    expect(j.status).toBe("rodando");
    expect(await recuperarTravados()).toBe(1);
    expect((await db.job.findUniqueOrThrow({ where: { id: j.id } })).status).toBe("pendente");
  });

  it("idempotência da fila: a mesma chave não cria outro trabalho", async () => {
    const a = await enfileirar("lead_qualificar", { leadId: "1" }, { chave: "q:1" });
    const b = await enfileirar("lead_qualificar", { leadId: "1" }, { chave: "q:1" });
    expect(a.id).toBe(b.id);
    expect(await db.job.count()).toBe(1);
  });

  it("emite eventos de tempo real em ordem, depois de gravar", async () => {
    registrarFonte(fonteFalsa("fa", () => [lugar("1", "Loja A")]));
    const b = await criarBusca({ nicho: "Lojas", cidade: "Praia Grande" }, null);
    await rodarFila();
    await atualizarProgresso(b.id);
    const ev = await eventosDesde(0, 1000);
    expect(ev.length).toBeGreaterThan(3);
    expect(ev.map((e) => e.id)).toEqual([...ev.map((e) => e.id)].sort((x, y) => x - y));
    const ultimo = ev.filter((e) => e.tipo === "busca.atualizada").at(-1)!;
    expect(JSON.parse(ultimo.payload).id).toBe(b.id);
    const meio = ev[Math.floor(ev.length / 2)].id;
    expect((await eventosDesde(meio, 1000)).every((e) => e.id > meio)).toBe(true);
  });
});
