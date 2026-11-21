// Identidade do robô em todas as requisições externas. Honesta: não se passa por navegador.

const contato = process.env.CRAWLER_CONTATO ? `; ${process.env.CRAWLER_CONTATO}` : "";

export const USER_AGENT = `ProspectorDeClientesParaSites/1.0 (+bot de pesquisa comercial; respeita robots.txt${contato})`;
