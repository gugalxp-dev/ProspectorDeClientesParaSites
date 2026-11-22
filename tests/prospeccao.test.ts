import { describe, expect, it } from "vitest";
import { elementoParaLugar, montarConsulta, tagsDoSegmento } from "../src/core/fontes/osm";
import { detalharPontuacao } from "../src/core/pontuacao";
import { avaliarSite, siteComProblemas } from "../src/core/prospeccao/avaliacaoSite";
import { linksInternos, normalizarParaVisita, rastrearSite } from "../src/core/prospeccao/crawler";
import { normalizarNome, confiancaSemSite } from "../src/core/prospeccao/importar";
import { interpretarRobots, permitido } from "../src/core/prospeccao/robots";
import { extrairDadosSite } from "../src/core/prospeccao/scraper";
import { fetchFalso } from "./ajuda";

const OPC = { profundidade: 2, maxPaginas: 6, timeoutMs: 5000, atrasoPorHostMs: 0, respeitarRobots: true };

describe("descoberta: OpenStreetMap", () => {
  it("traduz o segmento em tags do OSM", () => {
    expect(tagsDoSegmento("Pet shops")).toContain('["shop"="pet"]');
    expect(tagsDoSegmento("Salões de beleza")).toContain('["shop"="hairdresser"]');
    expect(tagsDoSegmento("Clínicas odontológicas")).toContain('["amenity"="dentist"]');
    expect(tagsDoSegmento("xyz inexistente")).toEqual([]);
  });

  it("monta consulta com bbox e busca por nome, escapando caracteres", () => {
    const q = montarConsulta('pet "shop"', [-24.1, -23.9, -46.5, -46.3], 100);
    expect(q).toContain("(-24.1,-46.5,-23.9,-46.3)");
    expect(q).toContain('nwr["name"~"pet shop",i]');
    expect(q).toContain("out center tags 100");
  });

  it("converte elemento OSM em lugar sem inventar campos", () => {
    const l = elementoParaLugar(
      { type: "node", id: 42, lat: -24, lon: -46.4, tags: { name: "Pet Feliz", shop: "pet", phone: "+55 13 99999-1111", "contact:instagram": "petfeliz", "addr:street": "Rua A", "addr:housenumber": "10" } },
      "Praia Grande",
    )!;
    expect(l).toMatchObject({ fonte: "osm", idExterno: "node/42", nome: "Pet Feliz", categoria: "pet", telefone: "+55 13 99999-1111", cidade: "Praia Grande" });
    expect(l.instagram).toBe("https://instagram.com/petfeliz");
    expect(l.website).toBeUndefined();
    expect(elementoParaLugar({ type: "node", id: 1, tags: {} }, "X")).toBeNull();
  });
});

describe("robots.txt", () => {
  it("aplica a regra mais específica e o grupo certo", () => {
    const r = interpretarRobots("User-agent: *\nDisallow: /privado\nAllow: /privado/contato\n\nUser-agent: OutroBot\nDisallow: /", "ProspectorDeClientesParaSites");
    expect(permitido(r, "/")).toBe(true);
    expect(permitido(r, "/privado/x")).toBe(false);
    expect(permitido(r, "/privado/contato")).toBe(true);
  });

  it("Disallow: / bloqueia tudo; vazio libera", () => {
    expect(permitido(interpretarRobots("User-agent: *\nDisallow: /", "x"), "/contato")).toBe(false);
    expect(permitido(interpretarRobots("User-agent: *\nDisallow:", "x"), "/contato")).toBe(true);
  });
});

describe("crawler", () => {
  it("normaliza URLs e remove rastreadores", () => {
    expect(normalizarParaVisita("https://Site.com.br/contato/?utm_source=x#topo")).toBe("https://site.com.br/contato");
    expect(normalizarParaVisita("mailto:a@b.com")).toBeNull();
  });

  it("fica no mesmo domínio, prioriza contato e ignora arquivos", () => {
    const html = '<a href="/blog">b</a><a href="/contato">c</a><a href="https://outro.com/x">o</a><a href="/foto.jpg">f</a><a href="https://www.site.com.br/sobre">s</a>';
    expect(linksInternos(html, "https://site.com.br/")).toEqual(["https://site.com.br/contato", "https://www.site.com.br/sobre", "https://site.com.br/blog"]);
  });

  it("controla profundidade, quantidade, ciclos e respeita robots", async () => {
    const visitas: string[] = [];
    const f = fetchFalso(
      {
        "https://loja.com.br/robots.txt": "User-agent: *\nDisallow: /admin",
        "https://loja.com.br": '<a href="/contato">c</a><a href="/admin">a</a><a href="/">home</a>',
        "https://loja.com.br/contato": '<a href="/">voltar</a><a href="/nivel2">n2</a>',
        "https://loja.com.br/nivel2": '<a href="/nivel3">n3</a>',
        "https://loja.com.br/nivel3": "fundo",
      },
      visitas,
    );
    const r = await rastrearSite("https://loja.com.br", { ...OPC, fetch: f });
    const urls = r.paginas.map((p) => p.url);
    expect(urls).toEqual(["https://loja.com.br/", "https://loja.com.br/contato", "https://loja.com.br/nivel2"]);
    expect(visitas).not.toContain("https://loja.com.br/admin");
    expect(visitas).not.toContain("https://loja.com.br/nivel3");
    expect(visitas.filter((v) => v === "https://loja.com.br/").length).toBe(1);
  });

  it("respeita robots que bloqueia tudo (não lê o conteúdo)", async () => {
    const f = fetchFalso({ "https://b.com.br/robots.txt": "User-agent: *\nDisallow: /", "https://b.com.br": '<a href="/contato">c</a> (13) 99999-0000' });
    const r = await rastrearSite("https://b.com.br", { ...OPC, fetch: f });
    expect(r.bloqueadoPorRobots).toBe(true);
    expect(r.paginas).toHaveLength(1);
    expect(r.paginas[0].html).toBe("");
  });

  it("registra erro quando o site não abre", async () => {
    const f = (async () => {
      throw Object.assign(new Error("fetch failed"), { cause: { code: "ENOTFOUND" } });
    }) as unknown as typeof fetch;
    const r = await rastrearSite("https://morto.com.br", { ...OPC, fetch: f });
    expect(r.erroInicial).toBe("ENOTFOUND");
    const a = avaliarSite(r, extrairDadosSite(r.paginas, "https://morto.com.br"));
    expect(a.online).toBe(false);
    expect(a.motivoFora).toMatch(/domínio não existe/);
  });
});

describe("scraper", () => {
  it("extrai telefone, WhatsApp, e-mail, redes e JSON-LD com a URL de origem", () => {
    const html = `
      <script type="application/ld+json">{"@type":"LocalBusiness","name":"Clínica Sorriso","telephone":"(13) 3333-4444","address":{"streetAddress":"Av. B, 20","addressLocality":"Santos"}}</script>
      <a href="https://wa.me/5513988887777">WhatsApp</a>
      <a href="mailto:contato@sorriso.com.br">email</a>
      <a href="https://instagram.com/clinicasorriso">ig</a>
      <a href="https://www.tiktok.com/@sorriso">tt</a>
      Ligue (13) 97777-6666`;
    const d = extrairDadosSite([{ url: "https://sorriso.com.br/contato", profundidade: 1, status: 200, ms: 10, html }], "https://sorriso.com.br");
    expect(d.nome?.valor).toBe("Clínica Sorriso");
    expect(d.whatsapps.map((w) => w.valor)).toEqual(["+5513988887777"]);
    expect(d.telefones.map((t) => t.valor)).toEqual(expect.arrayContaining(["+551333334444", "+5513977776666"]));
    expect(d.emails[0]).toEqual({ valor: "contato@sorriso.com.br", url: "https://sorriso.com.br/contato" });
    expect(d.instagram?.valor).toBe("https://instagram.com/clinicasorriso");
    expect(d.outrasRedes.tiktok?.valor).toContain("tiktok.com/@sorriso");
    expect(d.endereco?.valor).toBe("Av. B, 20, Santos");
  });

  it("não inventa dados quando a página não tem", () => {
    const d = extrairDadosSite([{ url: "https://x.com.br", profundidade: 0, status: 200, ms: 1, html: "<p>Bem-vindo</p>" }], "https://x.com.br");
    expect(d).toMatchObject({ telefones: [], whatsapps: [], emails: [] });
    expect(d.nome).toBeUndefined();
  });
});

describe("avaliação do site", () => {
  it("lista problemas objetivos", async () => {
    const f = fetchFalso({ "http://velho.com.br": "<html><head><title>Velho</title></head><body><marquee>oi</marquee>© 2012</body></html>" });
    const r = await rastrearSite("http://velho.com.br", { ...OPC, fetch: f });
    const a = avaliarSite(r, extrairDadosSite(r.paginas, "http://velho.com.br"));
    const falhas = a.verificacoes.filter((v) => v.ok === false).map((v) => v.id);
    expect(a.online).toBe(true);
    expect(falhas).toEqual(expect.arrayContaining(["https", "mobile", "contato", "atualizado", "tecnologia"]));
    expect(siteComProblemas(a)).toBe(true);
  });

  it("site bom passa", async () => {
    const html = `<html><head><meta name="viewport" content="width=device-width"><title>Bom</title><meta name="description" content="Clínica em Santos com atendimento"></head>
      <body><h1>Bom</h1><a href="https://wa.me/5513988887777">wa</a><form></form>© ${new Date().getFullYear()}<iframe src="https://maps.google.com/x"></iframe></body></html>`;
    const f = fetchFalso({ "https://bom.com.br": html });
    const r = await rastrearSite("https://bom.com.br", { ...OPC, fetch: f });
    const a = avaliarSite(r, extrairDadosSite(r.paginas, "https://bom.com.br"));
    expect(a.problemas).toEqual([]);
    expect(siteComProblemas(a)).toBe(false);
  });

  it("redireciona para a mesma marca em outro domínio (site regional): está no ar", () => {
    const a = avaliarSite(
      { inicial: "https://www.subway.com", urlFinal: "https://www.subway.com.br/", paginas: [{ url: "https://www.subway.com.br/", profundidade: 0, status: 200, ms: 5, html: "<title>Subway</title>" }], bloqueadoPorRobots: false, certificadoFalhou: false },
      extrairDadosSite([], ""),
    );
    expect(a.online).toBe(true);
  });

  it("site que bloqueia robôs (403) está no ar e não gera problemas falsos", () => {
    const a = avaliarSite(
      { inicial: "https://www.burgerking.com.br", urlFinal: "https://www.burgerking.com.br/", paginas: [{ url: "https://www.burgerking.com.br/", profundidade: 0, status: 403, ms: 5, html: "<title>Access Denied</title>" }], bloqueadoPorRobots: false, certificadoFalhou: false },
      extrairDadosSite([], ""),
    );
    expect(a.online).toBe(true);
    expect(a.problemas).toEqual([]);
  });

  it("domínio que redireciona para outro site conta como fora do ar", () => {
    const a = avaliarSite(
      { inicial: "https://antigo.com.br", urlFinal: "https://cassino.com/", paginas: [{ url: "https://antigo.com.br", profundidade: 0, status: 200, ms: 5, html: "x" }], bloqueadoPorRobots: false, certificadoFalhou: false },
      extrairDadosSite([], ""),
    );
    expect(a.online).toBe(false);
    expect(a.motivoFora).toMatch(/redireciona/);
  });
});

describe("deduplicação e pontuação", () => {
  it("normaliza nomes de empresa", () => {
    expect(normalizarNome("Pet Shop Amigão LTDA.")).toBe("pet shop amigao");
    expect(normalizarNome("PET SHOP AMIGÃO - ME")).toBe("pet shop amigao");
  });

  it("confiança de 'sem site' cresce com mais fontes", () => {
    expect(confiancaSemSite(1)).toBe("baixa");
    expect(confiancaSemSite(2)).toBe("media");
  });

  it("pontuação transparente lista os motivos", () => {
    const p = detalharPontuacao({ presenca: "sem_site_identificado", ehCelular: true, emails: "a@b.com", instagram: "x" });
    expect(p.total).toBe(35 + 20 + 5 + 10);
    expect(p.itens.map((i) => i.motivo)).toContain("Nenhum site identificado");
    expect(detalharPontuacao({ presenca: "sem_site_identificado", ehCelular: true, naoContatar: true }).total).toBe(0);
  });
});

describe("filtro da prospecção", async () => {
  const { ehRede, motivoIgnorarNaImportacao, motivoDescarte } = await import("../src/core/prospeccao/filtro");
  const cfg = { exigirCelular: true, descartarComSiteBom: true, ignorarRedes: true, redesIgnoradas: ["McDonald's", "Burger King", "Bob's"] };

  it("reconhece redes pelo nome, sem confundir com nomes parecidos", () => {
    expect(ehRede("McDonald's - Guarujá", cfg.redesIgnoradas)).toBe(true);
    expect(ehRede("BURGER KING Enseada", cfg.redesIgnoradas)).toBe(true);
    expect(ehRede("Bobs", cfg.redesIgnoradas)).toBe(true);
    expect(ehRede("Kings Burger Artesanal", cfg.redesIgnoradas)).toBe(false);
  });

  it("não registra rede (marca no OSM) nem fixo sem site; registra celular", () => {
    expect(motivoIgnorarNaImportacao({ nome: "Lanchonete X", rede: "Habib's", ehCelular: true, temSite: false }, cfg)).toMatch(/Rede/);
    expect(motivoIgnorarNaImportacao({ nome: "Pizzaria do Zé", ehCelular: false, temSite: false }, cfg)).toMatch(/fixo/);
    expect(motivoIgnorarNaImportacao({ nome: "Pizzaria do Zé", ehCelular: false, temSite: true }, cfg)).toBeNull();
    expect(motivoIgnorarNaImportacao({ nome: "Pizzaria do Zé", ehCelular: true, temSite: false }, cfg)).toBeNull();
  });

  it("depois da visita: fixo sem celular no site é descartado; WhatsApp do site salva", () => {
    const base = { nome: "Pizzaria do Zé", presenca: "sem_site_identificado", siteAvaliacao: null };
    expect(motivoDescarte({ ...base, ehCelular: false, whatsappE164: null }, cfg)).toMatch(/fixo/);
    expect(motivoDescarte({ ...base, ehCelular: false, whatsappE164: "+5513988880001" }, cfg)).toBeNull();
  });
});
