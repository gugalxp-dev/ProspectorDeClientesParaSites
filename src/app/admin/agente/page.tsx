import { FormConfig } from "@/components/admin/FormConfig";
import { Titulo } from "@/components/ui";
import { obterConfig } from "@/core/config";
import { exigirAdmin } from "@/lib/auth";

export default async function AdminAgente() {
  await exigirAdmin("/admin/agente");
  const [agente, transf] = await Promise.all([obterConfig("agente"), obterConfig("transferencia")]);
  return (
    <>
      <Titulo>Agente comercial</Titulo>
      <p className="text-sm text-slate-600">
        O agente raciocina com estas instruções, a base de conhecimento, os serviços cadastrados e o histórico da conversa. As regras comerciais de segurança
        (não inventar preço, não prometer resultado, transferir no aceite…) são fixas no código e conferidas antes de cada envio.
      </p>
      <FormConfig
        secao="agente"
        valores={agente}
        titulo="Comportamento"
        campos={[
          { caminho: "ativo", rotulo: "Agente ativo (desligar pausa todas as respostas automáticas)", tipo: "booleano" },
          { caminho: "iaFechaVenda", rotulo: "A IA fecha a venda (negocia, coleta os dados e envia o contrato)", tipo: "booleano", ajuda: "Você só entra depois que o cliente aceitar o contrato, para enviar o link de pagamento. Desligado: a IA transfere para você assim que o cliente aceitar a proposta." },
          { caminho: "nomeAgente", rotulo: "Nome do agente (opcional)", tipo: "texto" },
          { caminho: "nomeEmpresa", rotulo: "Nome da sua empresa", tipo: "texto" },
          { caminho: "siteEmpresa", rotulo: "Site / portfólio da sua empresa", tipo: "texto", ajuda: "Ex.: https://suaempresa.com.br. O agente envia quando o cliente pedir detalhes, exemplos de trabalho ou referências. Também pode ir no primeiro contato com {site}." },
          { caminho: "instrucoes", rotulo: "Instruções de comportamento", tipo: "area" },
          { caminho: "historicoMaximo", rotulo: "Mensagens do histórico no contexto", tipo: "numero", min: 4, max: 60 },
          { caminho: "trechosConhecimento", rotulo: "Trechos da base de conhecimento por resposta", tipo: "numero", min: 1, max: 12 },
        ]}
      />
      <FormConfig
        secao="agente"
        valores={agente}
        titulo="Limites e mensagens"
        campos={[
          { caminho: "maxSaidasSemResposta", rotulo: "Máx. mensagens seguidas sem resposta do cliente", tipo: "numero", min: 1, max: 5, ajuda: "Evita insistência." },
          { caminho: "maxMensagensPorConversaDia", rotulo: "Máx. mensagens do agente por conversa/dia", tipo: "numero", min: 1, max: 200 },
          { caminho: "templatePrimeiroContato", rotulo: "Nome do template aprovado para o primeiro contato", tipo: "texto", ajuda: "Exatamente como aprovado no WhatsApp Manager. Obrigatório no modo real." },
          { caminho: "idiomaTemplate", rotulo: "Idioma do template", tipo: "texto", ajuda: "Ex.: pt_BR" },
          { caminho: "mensagemPrimeiroContato", rotulo: "Primeiro contato no modo Baileys (texto)", tipo: "area", ajuda: "Usado só com WHATSAPP_MODO=baileys. Aceita {nome}, {agente}, {empresa} e {gancho}: uma frase montada do diagnóstico da empresa (ex.: \"Dei uma olhada no site de vocês e notei que o site não é adaptado para celular.\"). Sem custo de IA." },
          { caminho: "mensagemTransferencia", rotulo: "Mensagem ao transferir para humano", tipo: "area" },
          { caminho: "mensagemOptOut", rotulo: "Confirmação de opt-out", tipo: "area" },
        ]}
      />
      <FormConfig
        secao="transferencia"
        valores={transf}
        titulo="Regras de transferência para atendimento humano"
        descricao="Depois de transferido, o agente não envia mais nada naquele lead até alguém clicar em “Devolver ao agente”."
        campos={[
          { caminho: "aoAceitarProposta", rotulo: "Quando o cliente aceitar a proposta / quiser formalizar", tipo: "booleano" },
          { caminho: "aoPedirHumano", rotulo: "Quando pedir para falar com uma pessoa", tipo: "booleano" },
          { caminho: "aoPedirDescontoAcimaDoLimite", rotulo: "Quando pedir desconto acima do limite", tipo: "booleano" },
          { caminho: "aoNaoSaberResponder", rotulo: "Quando o agente não souber responder", tipo: "booleano" },
          { caminho: "maxObjecoes", rotulo: "Transferir após N objeções", tipo: "numero", min: 1, max: 20 },
          { caminho: "palavrasOptOut", rotulo: "Palavras de opt-out (uma por linha)", tipo: "lista", ajuda: "Palavras curtas só valem quando são a mensagem inteira (ex.: “Parar”)." },
        ]}
      />
    </>
  );
}
