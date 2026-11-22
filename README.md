# Client Prospector

Plataforma de prospecção comercial B2B para vender **sites institucionais**. Você informa o tipo de negócio e a cidade. O sistema descobre as empresas, visita os sites, avalia a presença digital, qualifica cada uma com IA e organiza tudo num CRM Kanban. Depois, um agente comercial conduz a conversa pelo **WhatsApp Business Cloud API** até a hora do fechamento, que fica com você.

> Baseado no projeto [prospectar](https://github.com/devfraga/prospectar) (MIT). Reaproveita a stack, a normalização de telefone, a classificação de presença web e a extração de e-mails e redes sociais.

## Como funciona

```
Pesquisa (segmento + cidade)
  └─ worker: descoberta em cada fonte ativa ─ OpenStreetMap (grátis)
       └─ importação com deduplicação global (id na fonte > telefone > domínio > nome+cidade)
            └─ por empresa: procura o site oficial → crawler (robots.txt, limites) → scraper → avaliação técnica do site
                 └─ score por regras + qualificação por IA (fatos x hipóteses) → CRM
                      └─ autorização (opt-in) → template de primeiro contato → agente IA no WhatsApp → transferência para você
```

- **Web** (Next.js 16) e **worker** (Node) são processos separados que compartilham o banco SQLite (modo WAL). Nada demorado roda dentro de uma requisição HTTP.
- **Fila persistida no banco**, com reserva atômica, idempotência por chave, retentativas com espera exponencial e recuperação de trabalhos travados.
- **Tempo real por SSE**. Os eventos só são gravados depois da persistência, têm id crescente (a reconexão com `Last-Event-ID` reenvia o que se perdeu) e são deduplicados no navegador.

## Executar localmente

Requisitos: Node 22 ou mais novo.

```bash
npm install
npm run setup                                   # .env com segredos do app, banco e base de conhecimento inicial
npm run usuario -- --email voce@exemplo.com --nome "Seu Nome" --admin   # mostra a senha uma única vez
npm run iniciar                                 # painel + worker em http://localhost:3000
```

Produção local: `npm run build` e depois `npm run iniciar -- --producao`.

Sem credenciais, tudo funciona em **modo simulado**: a IA é simulada (com resultados derivados dos fatos e marcados como "simulado") e o WhatsApp é simulado. Na página do lead existe um **simulador** para escrever como se fosse o cliente. A mensagem simulada percorre o mesmo caminho do webhook real.

## Testes

```bash
npm test            # 83 testes (banco próprio em data/test.db, integrações externas simuladas)
npm run typecheck
```

Os testes cobrem: criação e execução simultânea de pesquisas, descoberta, crawler (profundidade, ciclos, robots.txt), extração, avaliação de site, deduplicação, qualificação, CRM com concorrência otimista, histórico de mensagens, webhook (assinatura e duplicatas), transferência para humano, opt-in e opt-out, recuperação após falhas, eventos SSE, limites de consumo, RAG e as regras comerciais do agente.

**Um mock que funciona não valida a integração real.** WhatsApp e Claude só estão validados depois de configurados e testados com as credenciais reais (veja [docs/PENDENCIAS.md](docs/PENDENCIAS.md)).

## Segurança e LGPD

As regras seguem as notas de segurança da base de conhecimento (Autenticação, Autorização, Criptografia, Segredos, APIs, Validação):

| Tema | Implementação |
|---|---|
| Autenticação | e-mail + senha com **scrypt** e sal; sessão opaca (token de 32 bytes no cookie `httpOnly`, `sameSite=lax`, `secure` em produção); no banco só o **HMAC** do token; mesma mensagem e mesmo tempo de resposta para e-mail inexistente e senha errada; limite de 5 tentativas por e-mail e 20 por IP a cada 15 min |
| Autorização | papéis admin e operador; **cada página e cada rota** confere a sessão; área admin responde **404** para quem não é admin; bloquear um usuário ou trocar a senha derruba as sessões abertas |
| CSRF | verificação de `Origin` em toda rota que altera dados, mais o `sameSite` do cookie |
| XSS / cabeçalhos | React escapa o conteúdo; **CSP com nonce por requisição** (`strict-dynamic`, `frame-ancestors 'none'`), `nosniff`, `X-Frame-Options`, HSTS em produção; links coletados só abrem se forem `http(s)` e com `noopener nofollow` |
| Validação | **Zod** em toda entrada; limite de tamanho do corpo; Prisma parametrizado (sem SQL concatenado) |
| Segredos | só no servidor; `.env` fora do Git; credenciais cadastradas pelo painel ficam cifradas com **AES-256-GCM** e mostram só os 4 últimos caracteres; logs e auditoria mascaram tokens e chaves |
| Webhooks | `X-Hub-Signature-256` (HMAC do corpo bruto com o App Secret, comparação em tempo constante); verify token; deduplicação por id do evento; processamento assíncrono |
| Idempotência | `Idempotency-Key` nas criações; chaves únicas na fila e nos webhooks |
| Auditoria | logins, credenciais, configurações, consentimentos, opt-outs, transferências, mensagens manuais e exclusões |
| LGPD | opt-in obrigatório (origem e base legal) antes do primeiro contato; opt-out imediato, inclusive por palavras como "parar"; lista de supressão permanente (só o hash do número); exclusão de dados por lead; retenção automática configurável |
| WhatsApp | só API oficial; texto livre só dentro da janela de 24 h; primeiro contato só por template aprovado; limites diários; o agente não insiste sem resposta |
| Coleta | robô identificado no User-Agent, respeita robots.txt, intervalo por host, sem navegador, sem contornar CAPTCHA, login ou bloqueio; a fonte do Google Maps vem **desativada** por padrão |

## Estrutura

```
src/
  app/            páginas (dashboard, pesquisas, crm, leads, admin) e rotas /api
  components/     interface (Kanban, conversa, formulários do admin, SSE)
  core/
    fontes/       provedores de descoberta (osm) — um arquivo por fonte
    prospeccao/   crawler, robots, scraper, avaliação do site, descoberta do site, importação, qualificação
    ia/           camada independente de provedor (Anthropic/Claude padrão, OpenAI opcional, mock), custos e limites
    agente/       agente comercial, RAG, verificação das regras comerciais
    whatsapp/     cliente Cloud API/mock, webhook, conversas, consentimento, transferência
    crm/          etapas e leads
  lib/            auth, http (CSRF/Zod/erros), crypto, log, limite, auditoria
  worker/         processo da fila
```

Para adicionar uma fonte de descoberta, crie `src/core/fontes/minhafonte.ts` implementando `FonteDescoberta` e registre em `src/core/fontes/index.ts`. Para adicionar outro provedor de IA, implemente `ProvedorIA` em `src/core/ia/` e registre em `ia/servico.ts`.

## Limitações conhecidas

- **Cobertura do OpenStreetMap**: gratuito e permitido, mas no Brasil muitos negócios aparecem sem telefone ou site. O sistema tenta achar o site oficial pelo nome e só o confirma quando a página cita o nome e a cidade (ou o telefone).
- **SQLite + um worker**: ótimo para uso local e para um operador. Para várias instâncias, troque para Postgres e use um rate limit distribuído.
- **Custos são estimativas**, calculadas pela tabela de preços do painel. O valor cobrado de fato aparece no faturamento de cada provedor.
