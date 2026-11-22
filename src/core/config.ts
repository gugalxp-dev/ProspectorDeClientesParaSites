// Configurações editáveis pelo painel administrativo, guardadas na tabela Config (JSON validado com Zod).
// Cada seção tem valores padrão; o painel grava só o que foi alterado.

import { z } from "zod";
import { db } from "./db";

const precoModelo = z.object({
  entradaPorMilhao: z.number().min(0),
  saidaPorMilhao: z.number().min(0),
});

export const esquemaIa = z.object({
  /** "auto": Claude (Anthropic) quando houver chave; senão OpenAI, se houver; senão simulado. */
  provedor: z.enum(["auto", "anthropic", "openai", "mock"]).default("auto"),
  /** Modelo Claude. Opus = melhor qualidade; Sonnet e Haiku = mais baratos. */
  modelo: z.string().min(1).max(100).default("claude-opus-5-5"),
  /** Profundidade do raciocínio do Claude: low = mais rápido e barato, high = mais cuidadoso. */
  esforco: z.enum(["low", "medium", "high"]).default("medium"),
  /** Só quando o provedor for a OpenAI. */
  modeloOpenai: z.string().min(1).max(100).default("gpt-4o-mini"),
  /** Embeddings só existem na OpenAI; sem chave dela, a busca na base usa BM25 (palavras-chave). */
  modeloEmbedding: z.string().max(100).default("text-embedding-3-small"),
  usarEmbeddings: z.boolean().default(true),
  /** Só para a OpenAI (o Claude atual não usa temperatura). */
  temperatura: z.number().min(0).max(2).default(0.4),
  /** Inclui o raciocínio do Claude, por isso o valor é alto. */
  maxTokensResposta: z.number().int().min(1000).max(32_000).default(8000),
  timeoutMs: z.number().int().min(5000).max(120_000).default(45_000),
  /** USD por 1 milhão de tokens. Usado só para ESTIMAR custo; confira em https://claude.com/pricing e https://openai.com/api/pricing */
  precos: z.record(z.string(), precoModelo).default({
    "claude-opus-5-5": { entradaPorMilhao: 4, saidaPorMilhao: 20 },
    "claude-sonnet-5-5": { entradaPorMilhao: 2, saidaPorMilhao: 10 },
    "claude-haiku-5-5": { entradaPorMilhao: 0.1, saidaPorMilhao: 0.5 },
    // Modelos de reserva que a API pode usar quando o principal recusa um pedido.
    "claude-opus-4-8": { entradaPorMilhao: 5, saidaPorMilhao: 25 },
    "claude-opus-5": { entradaPorMilhao: 5, saidaPorMilhao: 25 },
    "gpt-4o-mini": { entradaPorMilhao: 0.15, saidaPorMilhao: 0.6 },
    "text-embedding-3-small": { entradaPorMilhao: 0.02, saidaPorMilhao: 0 },
  }),
  limiteDiarioUsd: z.number().min(0).default(2),
  limiteMensalUsd: z.number().min(0).default(30),
  alertaPct: z.number().int().min(1).max(100).default(80),
});

export const esquemaAgente = z.object({
  ativo: z.boolean().default(true),
  nomeAgente: z.string().max(60).default(""),
  nomeEmpresa: z.string().max(120).default(""),
  /** Site/portfólio da sua empresa: o agente envia quando o cliente quiser ver trabalhos ou mais detalhes. */
  siteEmpresa: z.string().max(300).default(""),
  /** Instruções de comportamento (o "jeito" do agente). Regras de segurança fixas ficam no código do agente. */
  instrucoes: z
    .string()
    .max(8000)
    .default(
      [
        "Você é um consultor comercial que oferece desenvolvimento de sites institucionais para pequenas e médias empresas.",
        "Converse de forma natural, cordial e objetiva, em português do Brasil, como uma pessoa real no WhatsApp: mensagens curtas, sem listas longas, sem emojis em excesso.",
        "Entenda o negócio do cliente antes de oferecer. Faça no máximo uma pergunta por mensagem.",
        "Adapte os argumentos ao segmento do cliente usando a base de conhecimento.",
        "Explique a diferença entre ter um site próprio e depender só de redes sociais quando fizer sentido.",
        "Trate objeções com respeito e argumentos fundamentados; se o cliente não tiver interesse, agradeça e encerre sem insistir.",
      ].join("\n"),
    ),
  maxSaidasSemResposta: z.number().int().min(1).max(5).default(2),
  maxMensagensPorConversaDia: z.number().int().min(1).max(50).default(12),
  mensagemTransferencia: z
    .string()
    .max(500)
    .default("Combinado! Vou passar seu atendimento para uma pessoa da nossa equipe, que continua com você por aqui em breve."),
  mensagemOptOut: z.string().max(500).default("Tudo bem, não enviaremos mais mensagens. Obrigado pela atenção!"),
  templatePrimeiroContato: z.string().max(512).default(""),
  idiomaTemplate: z.string().max(10).default("pt_BR"),
  /** Modo Baileys (sem templates da Meta): texto do primeiro contato. Aceita {nome}, {agente}, {empresa}, {site} e {gancho} (frase tirada do diagnóstico da empresa). */
  mensagemPrimeiroContato: z
    .string()
    .max(1000)
    .default("Olá! Tudo bem? Aqui é {agente}, da {empresa}. {gancho} Trabalhamos com sites para empresas como a {nome}. Posso te mostrar uma ideia rápida?"),
  /** Quantas mensagens do histórico vão no contexto. */
  historicoMaximo: z.number().int().min(4).max(60).default(20),
  trechosConhecimento: z.number().int().min(1).max(12).default(5),
});

export const esquemaTransferencia = z.object({
  aoAceitarProposta: z.boolean().default(true),
  aoPedirHumano: z.boolean().default(true),
  aoPedirDescontoAcimaDoLimite: z.boolean().default(true),
  aoNaoSaberResponder: z.boolean().default(true),
  maxObjecoes: z.number().int().min(1).max(20).default(5),
  palavrasOptOut: z
    .array(z.string().max(60))
    .default(["parar", "sair", "stop", "descadastrar", "não quero receber", "nao quero receber", "não me mande", "remover meu número"]),
});

export const esquemaProspeccao = z.object({
  fontes: z.record(z.string(), z.object({ ativa: z.boolean() })).default({
    osm: { ativa: true },
    web: { ativa: true },
  }),
  maxEmpresasPorBusca: z.number().int().min(10).max(2000).default(300),
  /** Fonte "Busca na internet (IA)": cada busca custa ~US$ 0,01 + texto lido. Limita o custo por pesquisa. */
  web: z
    .object({
      maxBuscas: z.number().int().min(1).max(10).default(4),
      maxEmpresas: z.number().int().min(5).max(60).default(30),
      /** US$ por busca na internet (tarifa da OpenAI), para estimar o custo. */
      custoPorBuscaUsd: z.number().min(0).max(1).default(0.01),
    })
    .default({ maxBuscas: 4, maxEmpresas: 30, custoPorBuscaUsd: 0.01 }),
  buscasSimultaneas: z.number().int().min(1).max(10).default(3),
  crawler: z
    .object({
      profundidade: z.number().int().min(0).max(4).default(2),
      maxPaginasPorSite: z.number().int().min(1).max(30).default(6),
      concorrencia: z.number().int().min(1).max(16).default(4),
      atrasoPorHostMs: z.number().int().min(250).max(30_000).default(1000),
      timeoutMs: z.number().int().min(2000).max(60_000).default(10_000),
      respeitarRobots: z.boolean().default(true),
    })
    .default({ profundidade: 2, maxPaginasPorSite: 6, concorrencia: 4, atrasoPorHostMs: 1000, timeoutMs: 10_000, respeitarRobots: true }),
  qualificarAutomaticamente: z.boolean().default(true),
  /** Só prospecta quem tem celular ou WhatsApp (fixo não tem WhatsApp). Os outros nem são registrados. */
  exigirCelular: z.boolean().default(true),
  /** Descarta empresas com site no ar e sem problemas técnicos: não precisam de site novo. */
  descartarComSiteBom: z.boolean().default(true),
  /** Ignora redes e franquias (marca no OpenStreetMap ou nome na lista abaixo): não compram site local. */
  ignorarRedes: z.boolean().default(true),
  redesIgnoradas: z
    .array(z.string().max(60))
    .default([
      "McDonald's", "Burger King", "Subway", "Domino's", "Pizza Hut", "Habib's", "Bob's", "KFC", "Popeyes", "Giraffas", "Spoleto",
      "China in Box", "Outback", "Madero", "Jeronimo", "Starbucks", "Cacau Show", "Kopenhagen", "Ragazzo", "Divino Fogão", "Coco Bambu",
      "Applebee's", "Chiquinho Sorvetes", "Oakberry", "Montana Grill", "Mania de Churrasco", "Gendai", "Taco Bell", "Burger King Express",
      "Casa do Pão de Queijo", "Fran's Café", "Rei do Mate", "The Best Açaí", "Vivenda do Camarão", "Pizza Hut Express", "Jin Jin", "Griletto",
      "Frango Assado", "Café do Ponto", "Dunkin", "Johnny Rockets", "Wendy's", "Tim Hortons", "Ofner", "Bacio di Latte", "Sodiê Doces",
    ]),
  scoreMinimoQualificado: z.number().int().min(0).max(100).default(50),
  /** Score final = regras x (100 - pesoIaPct)% + IA x pesoIaPct%. */
  pesoIaPct: z.number().int().min(0).max(100).default(50),
  reverificarSiteAposDias: z.number().int().min(1).max(365).default(30),
  /** Procura o site oficial pelo nome quando a fonte não traz (domínios prováveis + confirmação na página). */
  inferirSite: z.boolean().default(true),
});

export const esquemaPesos = z.object({
  semSite: z.number().default(35),
  soRedeSocial: z.number().default(30),
  siteForaDoAr: z.number().default(30),
  siteComProblemas: z.number().default(20),
  comSite: z.number().default(0),
  celular: z.number().default(20),
  email: z.number().default(5),
  redeSocial: z.number().default(10),
});

export const esquemaWhatsapp = z.object({
  limiteDiarioTemplates: z.number().int().min(0).max(1000).default(30),
  limiteDiarioMensagens: z.number().int().min(0).max(10_000).default(300),
  /** USD por template enviado, se você quiser estimar. null = sem estimativa. Confira na tabela da Meta. */
  precoTemplateUsd: z.number().min(0).nullable().default(null),

  // ── Proteção do número (Baileys) ──
  /** Pergunta ao WhatsApp se um número tem conta (fixos e telefones da busca por IA). Rajadas disso parecem robô. */
  verificarNumeros: z.boolean().default(true),
  verificacoesPorDia: z.number().int().min(0).max(500).default(40),
  intervaloVerificacaoSeg: z.number().int().min(3).max(120).default(10),
  /** Fila de primeiros contatos: intervalo aleatório entre um envio e outro (minutos). */
  envioIntervaloMinMin: z.number().int().min(1).max(120).default(3),
  envioIntervaloMaxMin: z.number().int().min(1).max(240).default(8),
  /** Só envia primeiro contato dentro deste horário (hora cheia, horário do computador). */
  horaInicio: z.number().int().min(0).max(23).default(9),
  horaFim: z.number().int().min(1).max(24).default(18),
  enviarSabado: z.boolean().default(true),
  enviarDomingo: z.boolean().default(false),
});

export const esquemaLgpd = z.object({
  retencaoDiasLeadsSemContato: z.number().int().min(7).max(3650).default(180),
  retencaoDiasMensagens: z.number().int().min(30).max(3650).default(365),
  retencaoDiasLogs: z.number().int().min(7).max(3650).default(90),
});


export const esquemaContrato = z.object({
  /** Dados da sua empresa (contratada): iguais em todos os contratos. */
  contratadaNome: z.string().max(200).default(""),
  /** Logo no cabeçalho do contrato, como data URL (imagem embutida: abre na página do cliente sem login). */
  logo: z
    .string()
    .max(400_000)
    .refine((v) => v === "" || /^data:image\/(png|jpeg|webp|svg\+xml);base64,[A-Za-z0-9+/=]+$/.test(v), "Logo inválida: envie PNG, JPG, WEBP ou SVG.")
    .default(""),
  contratadaDocumento: z.string().max(30).default(""),
  contratadaEndereco: z.string().max(300).default(""),
  contratadaEmail: z.string().max(200).default(""),
  cidade: z.string().max(100).default(""),
  foro: z.string().max(100).default(""),
  /** Modelo único. Variáveis: {{numero}}, {{contratante_nome}}, {{valor}}... (lista em Admin > Contrato). */
  modelo: z.string().max(30_000).default("# CONTRATO DE PRESTAÇÃO DE SERVIÇOS DE CRIAÇÃO DE SITE\nContrato nº {{numero}}\n\n## PARTES\nCONTRATADA: {{contratada_nome}}, inscrita no CPF/CNPJ sob o nº {{contratada_documento}}, com endereço em {{contratada_endereco}}, e-mail {{contratada_email}}.\n\nCONTRATANTE: {{contratante_nome}}, inscrito(a) no CPF/CNPJ sob o nº {{contratante_documento}}, com endereço em {{contratante_endereco}}, telefone {{contratante_telefone}}, e-mail {{contratante_email}}.\n\n## CLÁUSULA 1 — OBJETO\nA CONTRATADA prestará ao CONTRATANTE o serviço de {{servico}}: {{descricao_servico}}\n\n## CLÁUSULA 2 — PRAZO\nO serviço será entregue em até {{prazo_dias}} dias corridos, contados a partir do recebimento do pagamento inicial e de todo o material necessário (textos, fotos, logotipo e acessos) enviado pelo CONTRATANTE. Atrasos no envio desse material prorrogam o prazo pelo mesmo período.\n\n## CLÁUSULA 3 — VALOR E PAGAMENTO\nPelo serviço, o CONTRATANTE pagará o valor total de {{valor}}, da seguinte forma: {{forma_pagamento}}.\n\n## CLÁUSULA 4 — OBRIGAÇÕES DA CONTRATADA\na) Executar o serviço com qualidade técnica e dentro do prazo; b) manter o CONTRATANTE informado sobre o andamento; c) realizar até 2 (duas) rodadas de ajustes sobre o layout aprovado, sem custo adicional.\n\n## CLÁUSULA 5 — OBRIGAÇÕES DO CONTRATANTE\na) Fornecer as informações e materiais necessários; b) aprovar ou pedir ajustes em até 5 (cinco) dias úteis após cada entrega; c) efetuar os pagamentos nas datas combinadas.\n\n## CLÁUSULA 6 — DOMÍNIO, HOSPEDAGEM E PROPRIEDADE\nCustos de domínio e hospedagem, quando não incluídos no objeto, são de responsabilidade do CONTRATANTE. Após a quitação integral, o site e seu conteúdo passam a ser de propriedade do CONTRATANTE.\n\n## CLÁUSULA 7 — RESCISÃO\nQualquer parte pode rescindir este contrato mediante aviso por escrito. Os valores referentes às etapas já executadas não serão devolvidos.\n\n## CLÁUSULA 8 — OBSERVAÇÕES\n{{observacoes}}\n\n## CLÁUSULA 9 — FORO\nFica eleito o foro da comarca de {{foro}} para dirimir quaisquer dúvidas oriundas deste contrato.\n\nO aceite eletrônico deste contrato, com registro de data, hora, nome, documento e endereço IP, tem a mesma validade de uma assinatura.\n\n{{cidade_contratada}}, {{data}}."),
  /** Mensagem do WhatsApp com o link. Aceita {{nome}}, {{link}} e {{numero}}. */
  mensagemEnvio: z
    .string()
    .max(1000)
    .default("Olá, {{nome}}! Segue o contrato nº {{numero}} para você ler com calma. Se estiver tudo certo, é só confirmar o aceite no próprio link: {{link}}"),
});

export const SECOES = {
  ia: esquemaIa,
  agente: esquemaAgente,
  transferencia: esquemaTransferencia,
  prospeccao: esquemaProspeccao,
  pesos: esquemaPesos,
  whatsapp: esquemaWhatsapp,
  lgpd: esquemaLgpd,
  contrato: esquemaContrato,
} as const;

export type Secao = keyof typeof SECOES;
export type ConfigDe<S extends Secao> = z.infer<(typeof SECOES)[S]>;

export async function obterConfig<S extends Secao>(secao: S): Promise<ConfigDe<S>> {
  const c = await db.config.findUnique({ where: { chave: secao } });
  let bruto: unknown = {};
  if (c) {
    try {
      bruto = JSON.parse(c.valor);
    } catch {
      bruto = {};
    }
  }
  const r = SECOES[secao].safeParse(bruto);
  // Config antiga ou corrompida: volta ao padrão em vez de derrubar a aplicação.
  return (r.success ? r.data : SECOES[secao].parse({})) as ConfigDe<S>;
}

export async function salvarConfig<S extends Secao>(secao: S, valor: unknown): Promise<ConfigDe<S>> {
  const dados = SECOES[secao].parse(valor) as ConfigDe<S>;
  const v = JSON.stringify(dados);
  await db.config.upsert({ where: { chave: secao }, create: { chave: secao, valor: v }, update: { valor: v } });
  return dados;
}
