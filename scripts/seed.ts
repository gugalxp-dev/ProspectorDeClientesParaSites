// Conteúdo inicial da base de conhecimento (só se ela estiver vazia). Tudo editável em Admin > Base de conhecimento.
// Não inclui preços nem serviços: esses dependem do seu negócio e são cadastrados em Admin > Serviços e preços.

import "dotenv/config";
import { garantirEtapas } from "../src/core/crm/etapas";
import { db } from "../src/core/db";

const ITENS: Array<{ categoria: string; titulo: string; conteudo: string; tags?: string }> = [
  {
    categoria: "conceitos",
    titulo: "O que é um site institucional",
    conteudo:
      "Um site institucional é a página oficial da empresa na internet, em um endereço próprio (ex.: suaempresa.com.br). Apresenta quem é a empresa, os serviços ou produtos, localização, horário, formas de contato e diferenciais. Diferente de um perfil em rede social, o conteúdo e o endereço pertencem à empresa.",
    tags: "site, institucional, definição",
  },
  {
    categoria: "beneficios",
    titulo: "Credibilidade e apresentação comercial",
    conteudo:
      "Muitos clientes pesquisam a empresa antes de comprar ou agendar. Um site profissional, com informações claras e atualizadas, transmite seriedade e ajuda o cliente a confiar. Também é um material fácil de compartilhar em orçamentos, propostas e cartões de visita.",
    tags: "credibilidade, confiança, profissional",
  },
  {
    categoria: "beneficios",
    titulo: "Centralização de informações",
    conteudo:
      "O site reúne num só lugar o que o cliente precisa saber: serviços, preços quando fizer sentido, horários, endereço com mapa, perguntas frequentes e todos os canais de contato. Isso reduz perguntas repetidas no WhatsApp e ajuda o cliente a decidir mais rápido.",
    tags: "informações, centralizar, horários, endereço",
  },
  {
    categoria: "beneficios",
    titulo: "Formas de contato e captação",
    conteudo:
      "Um site pode ter botão de WhatsApp, formulário de orçamento, agendamento, mapa e telefone clicável. Ele pode ser encontrado em buscas no Google por quem ainda não conhece a empresa. O resultado depende de vários fatores (concorrência, conteúdo, divulgação), por isso não há garantia de quantidade de clientes.",
    tags: "contato, whatsapp, formulário, google, captação",
  },
  {
    categoria: "site_x_redes",
    titulo: "Diferenças entre site e redes sociais",
    conteudo:
      "Redes sociais são ótimas para relacionamento e divulgação do dia a dia, mas o perfil pertence à plataforma: alcance, regras e até a conta podem mudar sem aviso. O site é um canal próprio, aparece em buscas do Google, organiza as informações de forma permanente e não depende do algoritmo. O ideal é usar os dois juntos: as redes atraem e o site informa e converte.",
    tags: "instagram, facebook, redes sociais, diferença",
  },
  {
    categoria: "objecoes",
    titulo: "Objeção: já tenho Instagram",
    conteudo:
      "O Instagram é ótimo para mostrar o dia a dia, mas nem todo cliente usa ou procura por lá, e as informações se perdem no feed. Um site aparece quando alguém pesquisa no Google, deixa serviços, horários e localização sempre à mão e pode ter um link direto para o Instagram e o WhatsApp.",
    tags: "instagram, já tenho, rede social",
  },
  {
    categoria: "objecoes",
    titulo: "Objeção: está caro / não tenho orçamento agora",
    conteudo:
      "Entenda o que o cliente considera caro e compare com o uso: o site fica no ar por anos e trabalha 24 horas. Apresente apenas as condições e descontos cadastrados. Se o cliente pedir um valor abaixo do permitido, não negocie: diga que vai verificar com a equipe.",
    tags: "caro, preço, orçamento, desconto",
  },
  {
    categoria: "objecoes",
    titulo: "Objeção: não tenho tempo para cuidar de site",
    conteudo:
      "Um site institucional bem feito precisa de pouca manutenção: as informações principais mudam pouco. Explique o que está incluído no serviço cadastrado (por exemplo, quem cuida da publicação e de ajustes), sem prometer nada além das condições.",
    tags: "tempo, manutenção, trabalho",
  },
  {
    categoria: "objecoes",
    titulo: "Objeção: meus clientes vêm por indicação",
    conteudo:
      "Indicação é ótima. Mesmo indicado, o cliente costuma pesquisar o nome da empresa antes de entrar em contato. Um site ajuda a confirmar a boa impressão da indicação e facilita o primeiro contato.",
    tags: "indicação, boca a boca",
  },
  {
    categoria: "limites",
    titulo: "Possibilidades e limitações de um site",
    conteudo:
      "Um site melhora a apresentação, facilita o contato e pode ser encontrado no Google, mas não garante vendas, posição no Google ou aumento de faturamento. Resultados dependem do mercado, da divulgação e do atendimento. Seja honesto sobre isso.",
    tags: "garantia, resultado, limitação, google",
  },
  {
    categoria: "segmentos",
    titulo: "Pet shops e clínicas veterinárias",
    conteudo:
      "Para pet shops, o site pode mostrar banho e tosa, produtos, serviços veterinários, horário, área de entrega e um botão de agendamento pelo WhatsApp. Fotos do espaço ajudam o tutor a confiar.",
    tags: "pet shop, banho e tosa, veterinário",
  },
  {
    categoria: "segmentos",
    titulo: "Salões de beleza, barbearias e estética",
    conteudo:
      "Para salões e barbearias, o site pode apresentar serviços, profissionais, galeria de trabalhos, horários e agendamento. Clínicas de estética se beneficiam de páginas explicando cada procedimento.",
    tags: "salão, barbearia, estética, beleza",
  },
  {
    categoria: "segmentos",
    titulo: "Restaurantes, lanchonetes e delivery",
    conteudo:
      "Para restaurantes, o site pode ter cardápio sempre atualizado, horário, endereço com mapa, link para delivery e reservas. Um cardápio no site próprio evita depender só de aplicativos de entrega.",
    tags: "restaurante, cardápio, delivery, lanchonete",
  },
  {
    categoria: "segmentos",
    titulo: "Clínicas odontológicas e de saúde",
    conteudo:
      "Para clínicas, o site pode apresentar especialidades, equipe, convênios, estrutura e agendamento. Na área da saúde, as regras dos conselhos profissionais (ex.: CFO, CFM) limitam alguns tipos de propaganda; o conteúdo deve ser informativo.",
    tags: "dentista, odontologia, clínica, saúde",
  },
];

async function main() {
  await garantirEtapas();
  if ((await db.conhecimento.count()) === 0) {
    await db.conhecimento.createMany({ data: ITENS.map((i) => ({ ...i, ativo: true })) });
    console.log(`✓ Base de conhecimento iniciada com ${ITENS.length} itens.`);
  } else {
    console.log("  Base de conhecimento já tem conteúdo. Mantida.");
  }
}

main().finally(() => db.$disconnect());
